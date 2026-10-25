"""Evaluate the ONNX model and print Markdown for EVAL.md.

Labelled accuracy:   python model/eval.py --data model/data/plantvillage --preprocess both
Field distribution:  python model/eval.py --field <folder of unlabelled jpgs> --preprocess both
"""
from __future__ import annotations

import argparse
import collections
import json
import pathlib
import sys

import numpy as np
import onnxruntime as ort

HERE = pathlib.Path(__file__).parent
sys.path.insert(0, str(HERE))
import preprocess  # noqa: E402

LABELS = [entry["key"] for entry in json.loads((HERE / "labels.json").read_text())]
LOW_CONFIDENCE = 0.6
MIN_LEAF_FRACTION = 0.10


def images(folder: pathlib.Path) -> list[pathlib.Path]:
    return sorted(p for p in folder.rglob("*") if p.suffix.lower() in (".jpg", ".jpeg", ".png"))


class Model:
    def __init__(self, path: pathlib.Path) -> None:
        self.session = ort.InferenceSession(str(path), providers=["CPUExecutionProvider"])
        self.input = self.session.get_inputs()[0].name

    def probs(self, x: np.ndarray) -> np.ndarray:
        return self.session.run(None, {self.input: x})[0][0]


def accuracy(model: Model, folder: pathlib.Path, mode: str) -> None:
    to_tensor = getattr(preprocess, mode)
    per_class: dict[str, list[int]] = collections.defaultdict(lambda: [0, 0])
    for path in images(folder):
        truth = path.parent.name
        pred = LABELS[int(np.argmax(model.probs(to_tensor(preprocess.load(path.read_bytes())))))]
        per_class[truth][0] += pred == truth
        per_class[truth][1] += 1
    right = sum(c for c, _ in per_class.values())
    total = sum(n for _, n in per_class.values())
    print(f"\n#### `{mode}` preprocessing — {right}/{total} = **{right / total:.1%}**\n")
    print("| Class | Correct | Accuracy |\n|---|---|---|")
    for key in LABELS:
        c, n = per_class.get(key, [0, 0])
        print(f"| {key} | {c}/{n} | {c / n:.0%} |" if n else f"| {key} | 0/0 | – |")


def field(model: Model, folder: pathlib.Path, mode: str) -> None:
    to_tensor = getattr(preprocess, mode)
    counts: collections.Counter[str] = collections.Counter()
    verdicts: collections.Counter[str] = collections.Counter()
    confidences = []
    for path in images(folder):
        img = preprocess.load(path.read_bytes())
        p = model.probs(to_tensor(img))
        counts[LABELS[int(np.argmax(p))]] += 1
        confidences.append(float(np.max(p)))
        if preprocess.leaf_fraction(img) < MIN_LEAF_FRACTION:
            verdicts["no_leaf"] += 1
        elif np.max(p) < LOW_CONFIDENCE:
            verdicts["uncertain"] += 1
        else:
            verdicts["confident"] += 1
    total = sum(counts.values())
    uncertain = sum(c < LOW_CONFIDENCE for c in confidences)
    print(f"\n#### `{mode}` preprocessing — {total} field captures, "
          f"mean confidence {np.mean(confidences):.2f}, {uncertain} below {LOW_CONFIDENCE}\n")
    print("| Predicted (raw argmax) | Count | Share |\n|---|---|---|")
    for key, n in counts.most_common():
        print(f"| {key} | {n} | {n / total:.0%} |")
    print(f"\nWith the leaf check (< {MIN_LEAF_FRACTION}) and confidence floor (< {LOW_CONFIDENCE}): "
          + ", ".join(f"{k} {verdicts[k]}" for k in ("no_leaf", "uncertain", "confident")))


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", default=str(HERE / "agribot_tomato_v1.onnx"))
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--data", help="labelled folder: <label_key>/*.jpg")
    group.add_argument("--field", help="unlabelled folder of captures")
    parser.add_argument("--preprocess", choices=["tm", "legacy", "both"], default="tm")
    args = parser.parse_args()

    model = Model(pathlib.Path(args.model))
    modes = ["tm", "legacy"] if args.preprocess == "both" else [args.preprocess]
    for mode in modes:
        if args.data:
            accuracy(model, pathlib.Path(args.data), mode)
        else:
            field(model, pathlib.Path(args.field), mode)


if __name__ == "__main__":
    main()
