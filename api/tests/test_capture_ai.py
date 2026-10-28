from __future__ import annotations

import uuid

from fastapi.testclient import TestClient

from app.config import Settings
from app.diagnosis import DiagnosisError
from app.main import create_app
from conftest import OWNER, TOKEN, jpeg

RESULT = {"plant_present": True, "common_name": "Chilli", "scientific_name": "Capsicum annuum", "health": "healthy",
          "summary": "Looks fine.", "findings": []}


class FakeDiagnosis:
    def __init__(self, result=RESULT, error: str | None = None):
        self.result, self.error, self.calls = result, error, []

    def diagnose(self, image: bytes, place: str, month: int) -> dict:
        self.calls.append((len(image), place, month))
        if self.error:
            raise DiagnosisError(self.error)
        return self.result


def app_with(store, classifier, clock, diagnosis, **settings) -> TestClient:
    return TestClient(create_app(store, classifier, Settings(gemini_model="gemini-x", **settings), clock,
                                 diagnosis=diagnosis))


def post(client, capture_id=None):
    return client.post("/v1/captures", content=jpeg(), headers={
        "X-Device-Token": TOKEN, "Content-Type": "image/jpeg", "X-Capture-Id": capture_id or str(uuid.uuid4())})


def test_capture_queues_diagnosis_and_saves_result(store, classifier, clock):
    r = post(app_with(store, classifier, clock, FakeDiagnosis()))
    assert r.status_code == 201 and r.json()["ai_status"] == "pending"
    capture_id = r.json()["id"]
    assert store.captures[capture_id].ai_status == "pending"
    assert store.diagnoses[capture_id] == ("done", RESULT, "gemini-x")


def test_diagnosis_failure_is_recorded_with_safe_reason(store, classifier, clock):
    r = post(app_with(store, classifier, clock, FakeDiagnosis(error="Gemini quota or rate limit hit (HTTP 429).")))
    assert store.diagnoses[r.json()["id"]] == ("failed", {"reason": "Gemini quota or rate limit hit (HTTP 429)."}, "gemini-x")


def test_no_diagnosis_configured_means_skipped(store, classifier, clock):
    r = post(app_with(store, classifier, clock, None))
    assert r.json()["ai_status"] == "skipped" and store.diagnoses == {}


def test_daily_limit_skips_diagnosis(store, classifier, clock):
    fake = FakeDiagnosis()
    client = app_with(store, classifier, clock, fake, ai_daily_limit=2)
    statuses = []
    for _ in range(3):
        statuses.append(post(client).json()["ai_status"])
        clock.advance(2)  # keep the capture limiter (0.5/s) happy
    assert statuses == ["pending", "pending", "skipped"] and len(fake.calls) == 2


def test_place_comes_from_profile_else_india(store, classifier, clock):
    fake = FakeDiagnosis()
    client = app_with(store, classifier, clock, fake)
    post(client)
    store.places[OWNER] = "Kazipet, Telangana, India"
    clock.advance(2)
    post(client)
    assert [c[1] for c in fake.calls] == ["India", "Kazipet, Telangana, India"]
    assert fake.calls[0][2] == clock().month


def test_duplicate_capture_is_not_diagnosed_twice(store, classifier, clock):
    fake = FakeDiagnosis()
    client = app_with(store, classifier, clock, fake)
    capture_id = str(uuid.uuid4())
    assert post(client, capture_id).status_code == 201
    clock.advance(2)
    assert post(client, capture_id).status_code == 200
    assert len(fake.calls) == 1


def test_store_failure_while_saving_diagnosis_does_not_break_capture(store, classifier, clock):
    class Flaky(FakeDiagnosis):
        def diagnose(self, image, place, month):
            store.fail = True  # the store dies after the capture was saved
            return super().diagnose(image, place, month)

    r = post(app_with(store, classifier, clock, Flaky()))
    store.fail = False
    assert r.status_code == 201 and r.json()["id"] not in store.diagnoses
