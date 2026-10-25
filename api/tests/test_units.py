from __future__ import annotations

import hashlib
import io
import json
import pathlib
from datetime import datetime, timedelta, timezone

import numpy as np
import pytest
from PIL import Image

from app.auth import DeviceAuth, hash_token
from app.inference import OnnxClassifier
from app.labels import LABELS
from app.preprocess import InvalidImage, decode, leaf_fraction, to_tensor
from app.ratelimit import RateLimiter
from app.store import MemoryStore
from conftest import TOKEN, jpeg

API_DIR = pathlib.Path(__file__).resolve().parents[1]
REPO = API_DIR.parent
T0 = datetime(2026, 11, 1, tzinfo=timezone.utc)


def test_labels_match_model_labels_json():
    keys = [e["key"] for e in json.loads((REPO / "model" / "labels.json").read_text())]
    assert list(LABELS) == keys


def test_api_model_is_the_converted_model():
    digest = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()  # noqa: E731
    assert digest(API_DIR / "model" / "agribot_tomato_v1.onnx") == digest(REPO / "model" / "agribot_tomato_v1.onnx")


def test_hash_token_is_sha256_hex():
    assert hash_token("abc") == hashlib.sha256(b"abc").hexdigest()


def test_to_tensor_crops_and_scales_to_minus_one_one():
    img = Image.new("RGB", (300, 200), (255, 0, 127))
    x = to_tensor(img)
    assert x.shape == (1, 224, 224, 3) and x.dtype == np.float32
    np.testing.assert_allclose(x[0, 100, 100], [1.0, -1.0, 127 / 127.5 - 1], atol=1e-6)


def test_decode_rejects_non_jpeg():
    buf = io.BytesIO()
    Image.new("RGB", (200, 200)).save(buf, "PNG")
    with pytest.raises(InvalidImage):
        decode(buf.getvalue(), min_side=96)


def test_decode_rejects_truncated_jpeg():
    with pytest.raises(InvalidImage):
        decode(jpeg()[:200], min_side=96)


def test_decode_rejects_tiny_image():
    with pytest.raises(InvalidImage):
        decode(jpeg(size=(80, 60)), min_side=96)


def test_decode_accepts_vga_jpeg():
    assert decode(jpeg(size=(640, 480)), min_side=96).size == (640, 480)


def test_leaf_fraction_separates_grey_from_leaf():
    assert leaf_fraction(decode(jpeg(leafy=False), 96)) < 0.02
    assert leaf_fraction(decode(jpeg(leafy=True), 96)) > 0.3


def test_rate_limiter_burst_then_refill_then_daily_cap():
    limiter = RateLimiter(per_second=0.5, burst=3, daily=5)
    assert [limiter.allow("d", T0) for _ in range(4)] == [True, True, True, False]
    assert limiter.allow("d", T0 + timedelta(seconds=2))
    assert limiter.allow("d", T0 + timedelta(seconds=4))
    assert not limiter.allow("d", T0 + timedelta(seconds=60)), "daily cap of 5 reached"
    assert limiter.allow("other", T0)


class CountingStore(MemoryStore):
    def __init__(self) -> None:
        super().__init__()
        self.lookups = 0

    def get_device_by_token_hash(self, token_hash):
        self.lookups += 1
        return super().get_device_by_token_hash(token_hash)


def test_device_auth_caches_hits_for_ttl():
    store = CountingStore()
    store.add_device(TOKEN, owner="o", name="r")
    now = [T0]
    auth = DeviceAuth(store, lambda: now[0], ttl_seconds=60)
    assert auth.resolve(TOKEN) is not None
    assert auth.resolve(TOKEN) is not None
    assert store.lookups == 1
    now[0] = T0 + timedelta(seconds=61)
    auth.resolve(TOKEN)
    assert store.lookups == 2


def test_device_auth_rejects_malformed_without_lookup():
    store = CountingStore()
    auth = DeviceAuth(store, lambda: T0)
    assert auth.resolve(None) is None
    assert auth.resolve("not-a-token") is None
    assert auth.resolve("agb_" + "x" * 500) is None
    assert store.lookups == 0


def test_onnx_classifier_ranks_ten_labels():
    fixture = next(p for p in (REPO / "model" / "fixtures" / "late_blight").iterdir() if p.suffix.lower() == ".jpg")
    ranked = OnnxClassifier(API_DIR / "model" / "agribot_tomato_v1.onnx").predict(to_tensor(decode(fixture.read_bytes(), 96)))
    assert len(ranked) == 10 and {k for k, _ in ranked} == set(LABELS)
    probs = [p for _, p in ranked]
    assert probs == sorted(probs, reverse=True)
    assert abs(sum(probs) - 1) < 1e-4
