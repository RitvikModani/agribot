"""The ONNX model must reproduce the Keras model. Runs in the TF 2.15 venv only."""
from __future__ import annotations

import pathlib
import sys

import numpy as np
import pytest

tf = pytest.importorskip("tensorflow")
ort = pytest.importorskip("onnxruntime")

MODEL_DIR = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(MODEL_DIR))
import preprocess  # noqa: E402

FIXTURES = sorted(p for p in (MODEL_DIR / "fixtures").rglob("*") if p.suffix.lower() in (".jpg", ".jpeg"))


@pytest.fixture(scope="module")
def keras_model():
    return tf.keras.models.load_model(MODEL_DIR / "source" / "keras_model.h5", compile=False)


@pytest.fixture(scope="module")
def onnx_session():
    return ort.InferenceSession(str(MODEL_DIR / "agribot_tomato_v1.onnx"), providers=["CPUExecutionProvider"])


def test_one_fixture_per_class():
    assert len(FIXTURES) == 10
    assert len({p.parent.name for p in FIXTURES}) == 10


@pytest.mark.parametrize("path", FIXTURES, ids=lambda p: p.parent.name)
def test_onnx_matches_keras(path, keras_model, onnx_session):
    x = preprocess.tm(preprocess.load(path.read_bytes()))
    expected = keras_model(x, training=False).numpy()
    actual = onnx_session.run(None, {onnx_session.get_inputs()[0].name: x})[0]
    assert actual.shape == (1, 10)
    assert np.max(np.abs(expected - actual)) <= 1e-4
