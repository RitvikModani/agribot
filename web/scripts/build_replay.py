"""Build the dashboard's REPLAY dataset with the real model and the real API preprocessing.

    C:\\Users\\Ritvik\\.venvs\\agribot-api\\Scripts\\python web/scripts/build_replay.py

Takes one PlantVillage image per class (not the parity fixtures) plus one v1 bench
capture, runs them exactly as the API would, and writes web/public/replay/:
resized JPEGs + replay.json. Results are whatever the model really says, wrong ones included.
"""
from __future__ import annotations

import io
import json
import pathlib
import sys

from PIL import Image

REPO = pathlib.Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO / "api"))
from app.inference import OnnxClassifier  # noqa: E402
from app.preprocess import decode, leaf_fraction, to_tensor  # noqa: E402

OUT = REPO / "web" / "public" / "replay"
PLANTVILLAGE = REPO / "model" / "data" / "plantvillage"
V1_CAPTURES = REPO.parent / "agribot-v1-archive" / "field-captures"
ORDER = ["late_blight", "healthy", "early_blight", "target_spot", "bacterial_spot", "leaf_mold",
         "yellow_leaf_curl_virus", "septoria_leaf_spot", "mosaic_virus", "spider_mites"]


def verdict(confidence: float, leaf: float) -> str:
    return "no_leaf" if leaf < 0.10 else "uncertain" if confidence < 0.6 else "confident"


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    classifier = OnnxClassifier(REPO / "api" / "model" / "agribot_tomato_v1.onnx")
    samples: list[tuple[bytes, str | None, str]] = []
    for key in ORDER:
        path = sorted(p for p in (PLANTVILLAGE / key).iterdir() if p.suffix.lower() == ".jpg")[2]
        samples.append((path.read_bytes(), key, "PlantVillage dataset (lab photo)"))
    samples.insert(3, ((V1_CAPTURES / "p_133376.jpg").read_bytes(), None, "AgriBot v1 bench capture (indoor)"))

    items = []
    for i, (data, truth, origin) in enumerate(samples):
        img = decode(data, min_side=96)
        ranked = classifier.predict(to_tensor(img))
        label, confidence = ranked[0]
        leaf = leaf_fraction(img)
        name = f"{i:02d}-{truth or 'bench'}.jpg"
        thumb = img.copy()
        thumb.thumbnail((480, 480))
        buf = io.BytesIO()
        thumb.save(buf, "JPEG", quality=82, optimize=True)
        (OUT / name).write_bytes(buf.getvalue())
        items.append({
            "file": name, "label": label, "confidence": round(confidence, 4),
            "verdict": verdict(confidence, leaf), "leaf_fraction": round(leaf, 4),
            "top3": [{"label": k, "confidence": round(p, 4)} for k, p in ranked[:3]],
            "truth": truth, "source": origin,
        })
        print(f"{name:28s} truth={truth or '-':24s} -> {label:24s} {confidence:.2f} {items[-1]['verdict']}")
    (OUT / "replay.json").write_text(json.dumps(items, indent=1))


if __name__ == "__main__":
    main()
