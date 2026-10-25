"""Decode, model input, and leaf check. Mirrors model/preprocess.py (tm + leaf_fraction)."""
from __future__ import annotations

import io

import numpy as np
from PIL import Image, ImageOps

SIZE = (224, 224)
Image.MAX_IMAGE_PIXELS = 20_000_000  # a 2 MB JPEG has no business decoding larger


class InvalidImage(ValueError):
    pass


def decode(data: bytes, min_side: int) -> Image.Image:
    if not data.startswith(b"\xff\xd8\xff"):
        raise InvalidImage("not a JPEG")
    try:
        img = Image.open(io.BytesIO(data))
        img.load()
        img = ImageOps.exif_transpose(img).convert("RGB")
    except (OSError, Image.DecompressionBombError, SyntaxError) as exc:
        raise InvalidImage(f"undecodable JPEG: {exc}") from exc
    if min(img.size) < min_side:
        raise InvalidImage(f"image too small: {img.size}")
    return img


def to_tensor(img: Image.Image) -> np.ndarray:
    fitted = ImageOps.fit(img, SIZE, Image.Resampling.LANCZOS)
    x = np.asarray(fitted, dtype=np.float32) / 127.5 - 1.0
    return x[np.newaxis, ...]


def leaf_fraction(img: Image.Image) -> float:
    """Share of yellow-to-green pixels after grey-world white balance (see model/EVAL.md)."""
    a = np.asarray(ImageOps.fit(img, SIZE), dtype=np.float32)
    a = np.clip(a * (a.mean() / np.maximum(a.reshape(-1, 3).mean(axis=0), 1e-3)), 0, 255)
    hsv = np.asarray(Image.fromarray(a.astype(np.uint8)).convert("HSV"), dtype=np.float32)
    hue, sat, val = hsv[..., 0] * 360 / 255, hsv[..., 1] / 255, hsv[..., 2] / 255
    return float(((hue >= 25) & (hue <= 160) & (sat >= 0.20) & (val >= 0.15)).mean())
