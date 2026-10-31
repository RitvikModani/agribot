from __future__ import annotations

import uuid
from datetime import timedelta

from conftest import OWNER, TOKEN, jpeg


def post(client, body=None, token=TOKEN, capture_id=None, trigger="manual", content_type="image/jpeg"):
    headers = {"Content-Type": content_type, "X-Capture-Id": capture_id or str(uuid.uuid4()), "X-Trigger": trigger}
    if token:
        headers["X-Device-Token"] = token
    return client.post("/v1/captures", content=jpeg() if body is None else body, headers=headers)


def test_healthz(client):
    r = client.get("/healthz")
    assert r.status_code == 200 and r.json() == {"ok": True, "model_version": "tomato-tm-v1"}


def test_missing_and_unknown_token_are_401(client):
    assert post(client, token=None).status_code == 401
    assert post(client, token="agb_" + "u" * 43).status_code == 401


def test_revoked_device_is_403(client, store):
    store.revoke(TOKEN)
    assert post(client).status_code == 403


def test_wrong_content_type_is_415(client):
    assert post(client, content_type="image/png").status_code == 415


def test_oversized_upload_is_413(client):
    assert post(client, body=b"\xff\xd8\xff" + b"0" * (2 * 1024 * 1024)).status_code == 413


def test_invalid_inputs_are_422(client):
    assert post(client, body=b"not a jpeg at all").status_code == 422
    assert post(client, body=jpeg(size=(80, 60))).status_code == 422
    assert post(client, capture_id="not-a-uuid").status_code == 422
    assert post(client, trigger="sometimes").status_code == 422


def test_capture_stores_image_and_row(client, store):
    capture_id = str(uuid.uuid4())
    r = post(client, capture_id=capture_id)
    assert r.status_code == 201
    body = r.json()
    assert body["id"] == capture_id
    assert body["label"] == "early_blight" and body["confidence"] == 0.9
    assert body["verdict"] == "confident" and 0.3 < body["leaf_fraction"] <= 1
    assert [t["label"] for t in body["top3"]][0] == "early_blight" and len(body["top3"]) == 3
    device_id = store.device_id(TOKEN)
    path = f"{OWNER}/{device_id}/{capture_id}.jpg"
    assert store.images[path][:2] == b"\xff\xd8"
    row = store.captures[capture_id]
    assert row.image_path == path and row.model_version == "tomato-tm-v1" and row.owner == OWNER


def test_low_confidence_is_uncertain(client, classifier):
    classifier.top = ("late_blight", 0.41)
    assert post(client).json()["verdict"] == "uncertain"


def test_grey_frame_is_no_leaf(client):
    assert post(client, body=jpeg(leafy=False)).json()["verdict"] == "no_leaf"


def test_plant_tag_from_state_is_recorded(client, store):
    store.state(TOKEN).plant_tag = "row-4"
    capture_id = str(uuid.uuid4())
    post(client, capture_id=capture_id)
    assert store.captures[capture_id].plant_tag == "row-4"


def test_retry_with_same_id_returns_original(client, store, clock):
    capture_id = str(uuid.uuid4())
    first = post(client, capture_id=capture_id)
    clock.advance(2)
    again = post(client, capture_id=capture_id)
    assert again.status_code == 200 and again.json() == first.json()
    assert store.insert_count == 1


def test_capture_id_owned_by_another_device_is_409(client, store, clock):
    capture_id = str(uuid.uuid4())
    post(client, capture_id=capture_id)
    other = "agb_" + "o" * 43
    store.add_device(other, owner=OWNER, name="second")
    clock.advance(2)
    assert post(client, token=other, capture_id=capture_id).status_code == 409


def test_manual_trigger_clears_request_patrol_does_not(client, store, clock):
    store.state(TOKEN).capture_requested_at = clock.now
    post(client, trigger="patrol")
    assert store.state(TOKEN).capture_requested_at is not None
    clock.advance(2)
    post(client, trigger="manual")
    assert store.state(TOKEN).capture_requested_at is None


def test_rate_limit_429_then_recovers(client, clock):
    codes = [post(client).status_code for _ in range(4)]
    assert codes == [201, 201, 201, 429]
    clock.advance(2)
    assert post(client).status_code == 201


def test_store_failure_is_503(client, store):
    store.fail = True
    assert post(client).status_code == 503


def test_state_returns_controls_and_server_time(client, store, clock):
    s = store.state(TOKEN)
    s.patrol_on, s.patrol_interval_s, s.capture_requested_at = True, 15, clock.now - timedelta(seconds=3)
    s.cam_exposure, s.cam_hmirror, s.cam_vflip = -2, True, False
    r = client.get("/v1/device/state", headers={"X-Device-Token": TOKEN})
    assert r.status_code == 200
    assert r.json() == {
        "capture_requested_at": "2026-11-01T08:59:57Z",
        "patrol_on": True,
        "patrol_interval_s": 15,
        "cam_exposure": -2,
        "cam_hmirror": True,
        "cam_vflip": False,
        "server_time": "2026-11-01T09:00:00Z",
    }


def test_state_camera_defaults(client):
    body = client.get("/v1/device/state", headers={"X-Device-Token": TOKEN}).json()
    assert (body["cam_exposure"], body["cam_hmirror"], body["cam_vflip"]) == (0, False, False)


def test_state_requires_token(client):
    assert client.get("/v1/device/state").status_code == 401


def test_state_throttles_last_seen_writes(client, store, clock):
    headers = {"X-Device-Token": TOKEN}
    client.get("/v1/device/state", headers=headers)
    clock.advance(2)
    client.get("/v1/device/state", headers=headers)
    assert store.touches == 1
    clock.advance(4)
    client.get("/v1/device/state", headers=headers)
    assert store.touches == 2
