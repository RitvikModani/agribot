"""Image preprocessing for the AgriBot tomato model.

`tm` is what a Teachable Machine export expects: centre-crop to 224x224 and
scale pixels to [-1, 1]. `legacy` reproduces v1's bug (squash-resize, x/255)
so eval.py can measure what the fix is worth.
"""
from __future__ import annotations

import io

import numpy as np
from PIL import Image, ImageOps

SIZE = (224, 224)


def load(data: bytes) -> Image.Image:
    img = ImageOps.exif_transpose(Image.open(io.BytesIO(data)))
    return img.convert("RGB")


def tm(img: Image.Image) -> np.ndarray:
    fitted = ImageOps.fit(img, SIZE, Image.Resampling.LANCZOS)
    x = np.asarray(fitted, dtype=np.float32) / 127.5 - 1.0
    return x[np.newaxis, ...]


def legacy(img: Image.Image) -> np.ndarray:
    x = np.asarray(img.resize(SIZE), dtype=np.float32) / 255.0
    return x[np.newaxis, ...]


def leaf_fraction(img: Image.Image) -> float:
    """Share of pixels with plant colour (yellow to green) after grey-world white balance.

    A coarse guard: the model has no "not a leaf" class, so rooms and ceilings
    otherwise come back as confident blight. White balance first, because the
    OV2640 often tints whole frames yellow-green before its AWB settles.
    """
    a = np.asarray(ImageOps.fit(img, SIZE), dtype=np.float32)
    a = np.clip(a * (a.mean() / np.maximum(a.reshape(-1, 3).mean(axis=0), 1e-3)), 0, 255)
    hsv = np.asarray(Image.fromarray(a.astype(np.uint8)).convert("HSV"), dtype=np.float32)
    hue, sat, val = hsv[..., 0] * 360 / 255, hsv[..., 1] / 255, hsv[..., 2] / 255
    return float(((hue >= 25) & (hue <= 160) & (sat >= 0.20) & (val >= 0.15)).mean())
