from __future__ import annotations

import io
import pathlib
import sys
from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient
from PIL import Image, ImageDraw

API_DIR = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(API_DIR))

from app.config import Settings  # noqa: E402
from app.labels import LABELS  # noqa: E402
from app.main import create_app  # noqa: E402
from app.store import MemoryStore  # noqa: E402

TOKEN = "agb_" + "t" * 43
OWNER = "11111111-1111-1111-1111-111111111111"


def jpeg(size=(320, 240), leafy=True) -> bytes:
    img = Image.new("RGB", size, (128, 128, 128))
    if leafy:
        ImageDraw.Draw(img).ellipse((40, 30, size[0] - 40, size[1] - 30), fill=(60, 150, 50))
    buf = io.BytesIO()
    img.save(buf, "JPEG", quality=90)
    return buf.getvalue()


class FakeClassifier:
    def __init__(self) -> None:
        self.top = ("early_blight", 0.9)

    def predict(self, x):
        assert x.shape == (1, 224, 224, 3)
        label, p = self.top
        rest = [k for k in LABELS if k != label]
        share = (1 - p) / len(rest)
        return [(label, p)] + [(k, share) for k in rest]


class Clock:
    def __init__(self) -> None:
        self.now = datetime(2026, 11, 1, 9, 0, 0, tzinfo=timezone.utc)

    def __call__(self) -> datetime:
        return self.now

    def advance(self, seconds: float) -> None:
        self.now += timedelta(seconds=seconds)


@pytest.fixture
def store() -> MemoryStore:
    s = MemoryStore()
    s.add_device(TOKEN, owner=OWNER, name="rover")
    return s


@pytest.fixture
def clock() -> Clock:
    return Clock()


@pytest.fixture
def classifier() -> FakeClassifier:
    return FakeClassifier()


@pytest.fixture
def client(store, classifier, clock) -> TestClient:
    return TestClient(create_app(store, classifier, Settings(), clock))
