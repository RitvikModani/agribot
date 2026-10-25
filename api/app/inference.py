from __future__ import annotations

import pathlib
from typing import Protocol

import numpy as np
import onnxruntime as ort

from .labels import LABELS


class Classifier(Protocol):
    def predict(self, x: np.ndarray) -> list[tuple[str, float]]:
        """All labels with probabilities, highest first."""


class OnnxClassifier:
    def __init__(self, path: str | pathlib.Path) -> None:
        self._session = ort.InferenceSession(str(path), providers=["CPUExecutionProvider"])
        self._input = self._session.get_inputs()[0].name

    def predict(self, x: np.ndarray) -> list[tuple[str, float]]:
        probs = self._session.run(None, {self._input: x})[0][0]
        order = np.argsort(probs)[::-1]
        return [(LABELS[i], float(probs[i])) for i in order]
