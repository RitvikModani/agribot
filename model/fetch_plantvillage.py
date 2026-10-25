"""Download a deterministic labelled sample of PlantVillage tomato images.

Source: github.com/spMohanty/PlantVillage-Dataset (raw/color). Writes
<out>/<label_key>/<name>.jpg. With --fixtures, also writes one image per class
to model/fixtures/ for the parity test.

Note: Teachable Machine models are usually trained on PlantVillage itself, so
accuracy on this sample checks preprocessing, not real-world performance.
"""
from __future__ import annotations

import argparse
import json
import os
import pathlib
import urllib.parse
import urllib.request

HERE = pathlib.Path(__file__).parent
REPO = "spMohanty/PlantVillage-Dataset"
BASE = "raw/color"


def get(url: str) -> bytes:
    headers = {"User-Agent": "agribot-eval"}
    if token := os.environ.get("GITHUB_TOKEN"):
        headers["Authorization"] = f"Bearer {token}"
    with urllib.request.urlopen(urllib.request.Request(url, headers=headers), timeout=60) as r:
        return r.read()


def list_images(folder: str) -> list[str]:
    url = f"https://api.github.com/repos/{REPO}/contents/{urllib.parse.quote(f'{BASE}/{folder}')}"
    entries = json.loads(get(url))
    return sorted(e["name"] for e in entries if e["name"].lower().endswith((".jpg", ".jpeg")))


def raw_url(folder: str, name: str) -> str:
    return f"https://raw.githubusercontent.com/{REPO}/master/{urllib.parse.quote(f'{BASE}/{folder}/{name}')}"


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--per-class", type=int, default=20)
    parser.add_argument("--out", default=str(HERE / "data" / "plantvillage"))
    parser.add_argument("--fixtures", action="store_true")
    args = parser.parse_args()

    labels = json.loads((HERE / "labels.json").read_text())
    for label in labels:
        names = list_images(label["plantvillage"])
        step = max(1, len(names) // args.per_class)
        picks = names[::step][: args.per_class]
        dest = pathlib.Path(args.out) / label["key"]
        dest.mkdir(parents=True, exist_ok=True)
        for name in picks:
            target = dest / name
            if not target.exists():
                target.write_bytes(get(raw_url(label["plantvillage"], name)))
        if args.fixtures:
            fixture_dir = HERE / "fixtures" / label["key"]
            fixture_dir.mkdir(parents=True, exist_ok=True)
            # A name the eval sample skips (offset by half a step), so fixtures and eval differ.
            name = names[step // 2]
            (fixture_dir / name).write_bytes(get(raw_url(label["plantvillage"], name)))
        print(f"{label['key']}: {len(picks)} of {len(names)}")


if __name__ == "__main__":
    main()
