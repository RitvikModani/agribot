from __future__ import annotations

import base64
import json

import httpx
import pytest

from app.diagnosis import DIAGNOSIS_SCHEMA, DiagnosisError, GeminiDiagnosis, build_diagnosis_prompt, parse_diagnosis

FINDING = {"problem": "Leaf curl virus", "kind": "disease", "severity": "moderate", "box_2d": [120, 340, 410, 620],
           "advice": "Remove curled leaves and control whitefly.", "active_ingredient": "imidacloprid"}
RESULT = {"plant_present": True, "common_name": "Chilli", "scientific_name": "Capsicum annuum", "health": "diseased",
          "summary": "Upper leaves curled.", "findings": [FINDING]}


def interaction(payload) -> dict:
    text = payload if isinstance(payload, str) else json.dumps(payload)
    return {"status": "completed", "steps": [{"type": "model_output", "content": [{"type": "text", "text": text}]}]}


def test_schema_requires_every_field():
    assert set(DIAGNOSIS_SCHEMA["required"]) == set(DIAGNOSIS_SCHEMA["properties"])
    finding = DIAGNOSIS_SCHEMA["properties"]["findings"]["items"]
    assert set(finding["required"]) == set(finding["properties"])


def test_prompt_carries_place_month_and_box_format():
    prompt = build_diagnosis_prompt("Kazipet, Telangana, India", 10)
    assert "Kazipet" in prompt and "Oct" in prompt and "[ymin, xmin, ymax, xmax]" in prompt and "0-1000" in prompt


def test_parse_valid_result():
    out = parse_diagnosis(interaction(RESULT))
    assert out["common_name"] == "Chilli" and out["findings"][0]["box_2d"] == [120, 340, 410, 620]


def test_parse_rejects_missing_fields():
    with pytest.raises(DiagnosisError, match="missing findings"):
        parse_diagnosis(interaction({k: v for k, v in RESULT.items() if k != "findings"}))


def test_parse_rejects_bad_health():
    with pytest.raises(DiagnosisError, match="bad plant_present, health"):
        parse_diagnosis(interaction({**RESULT, "health": "sick"}))


def test_parse_skips_findings_with_bad_enums():
    out = parse_diagnosis(interaction({**RESULT, "findings": [{**FINDING, "severity": "awful"}, FINDING]}))
    assert len(out["findings"]) == 1


def test_parse_clamps_boxes():
    out = parse_diagnosis(interaction({**RESULT, "findings": [{**FINDING, "box_2d": [-5, 10, 1200, 900]}]}))
    assert out["findings"][0]["box_2d"] == [0, 10, 1000, 900]


@pytest.mark.parametrize("box", [[400, 100, 300, 200], [1, 2, 3], "nope", [0, 0, 0, 0]])
def test_parse_drops_unusable_boxes_but_keeps_finding(box):
    out = parse_diagnosis(interaction({**RESULT, "findings": [{**FINDING, "box_2d": box}]}))
    assert out["findings"][0]["box_2d"] is None and out["findings"][0]["problem"] == "Leaf curl virus"


def test_parse_caps_findings_and_text():
    long = {**FINDING, "advice": "x" * 500}
    out = parse_diagnosis(interaction({**RESULT, "findings": [long] * 9}))
    assert len(out["findings"]) == 6 and len(out["findings"][0]["advice"]) == 200


def test_parse_no_plant_empties_findings():
    out = parse_diagnosis(interaction({**RESULT, "plant_present": False, "health": "unclear"}))
    assert out["plant_present"] is False and out["findings"] == []


def test_parse_names_unfinished_and_empty_replies():
    with pytest.raises(DiagnosisError, match="in_progress"):
        parse_diagnosis({"status": "in_progress", "steps": []})
    with pytest.raises(DiagnosisError, match="no text"):
        parse_diagnosis({"status": "completed", "steps": []})


def client(handler) -> GeminiDiagnosis:
    return GeminiDiagnosis("test-key", "gemini-x", timeout=1, transport=httpx.MockTransport(handler))


def test_diagnose_sends_image_and_key_in_header():
    seen = {}

    def reply(request):
        seen["key"] = request.headers["x-goog-api-key"]
        seen["url"] = str(request.url)
        seen["body"] = json.loads(request.content)
        return httpx.Response(200, json=interaction(RESULT))

    out = client(reply).diagnose(b"\xff\xd8jpeg", "Kazipet", 10)
    image = seen["body"]["input"][1]
    assert out["common_name"] == "Chilli"
    assert image == {"type": "image", "data": base64.b64encode(b"\xff\xd8jpeg").decode(), "mime_type": "image/jpeg"}
    assert seen["body"]["generation_config"] == {"thinking_level": "minimal"}
    assert seen["key"] == "test-key" and "test-key" not in seen["url"]


def test_diagnose_timeout_says_so():
    def hang(request):
        raise httpx.ReadTimeout("timed out", request=request)

    with pytest.raises(DiagnosisError, match="didn't answer within 1 s"):
        client(hang).diagnose(b"x", "Kazipet", 10)


def test_diagnose_http_error_is_safe():
    def limited(request):
        return httpx.Response(429, json={"error": {"code": 429, "status": "RESOURCE_EXHAUSTED", "message": "quota"}})

    with pytest.raises(DiagnosisError, match="HTTP 429") as caught:
        client(limited).diagnose(b"x", "Kazipet", 10)
    assert "test-key" not in str(caught.value)
