# Model evaluation — `agribot_tomato_v1.onnx`

Model: Google Teachable Machine export (MobileNetV2 features → Dense 100 → Dense 10), converted from `source/keras_model.h5`. Recorded 2026-10-25.

## Conversion parity

ONNX vs Keras on 10 fixtures (one per class): max absolute difference ≤ 1e-4 — **pass** (`model/tests/test_parity.py`).

## Lab accuracy (PlantVillage, 20 images per class, n = 200)

| Preprocessing | Accuracy |
|---|---|
| **v2: centre-crop, scale to [-1, 1]** | **78.5%** (157/200) |
| v1: squash-resize, scale to [0, 1] | 63.5% (127/200) |

| Class | v2 | v1 |
|---|---|---|
| bacterial_spot | 75% | 50% |
| early_blight | 45% | 15% |
| healthy | 90% | 100% |
| late_blight | 75% | 75% |
| leaf_mold | 75% | 80% |
| mosaic_virus | 100% | 95% |
| septoria_leaf_spot | 60% | 55% |
| spider_mites | 80% | 70% |
| target_spot | 90% | 15% |
| yellow_leaf_curl_virus | 95% | 80% |

Caveat: Teachable Machine models are typically trained on PlantVillage, so this sample may overlap the training set. Treat 78.5% as an upper bound on lab-style photos, not field accuracy. Early blight (45%) and septoria (60%) are the weak classes.

## v1 rover captures (n = 151, unlabelled)

The 151 images in the v1 Google Sheet are **indoor bench tests, not tomato plants**: rooms, ceilings (several with a yellow-green OV2640 white-balance tint), dark frames, and one potted snake plant. No tomato leaf appears.

Without any guard, the model labels 98% of them early or late blight (mean confidence 0.83) — under both v1 and v2 preprocessing. The field "blight" results in v1 came from photographing non-plants, not from the preprocessing bug.

## v2 guards

| Guard | Rule | Effect on the 151 v1 captures | Effect on PlantVillage leaves |
|---|---|---|---|
| Leaf check | plant-colour fraction after grey-world white balance < 0.10 → `no_leaf` | 109 rejected | 98.5% pass (min fixture 0.107) |
| Confidence floor | top probability < 0.6 → `uncertain` | 7 more flagged | — |
| Remaining "confident" | | 35 (mostly colour-cast frames) | — |

The leaf check is a coarse colour heuristic, not a classifier: it cannot tell tomato from other plants, and a strongly tinted frame can pass. The camera firmware discards warm-up frames so auto white balance settles before capture.

## What the deck may claim

- "78.5% on a PlantVillage test sample (lab photos, 10 tomato classes)" — with the overlap caveat.
- Not: any field accuracy. That needs ≥ 20 labelled photos of real tomato leaves (`eval.py --data`).

## Reproduce

```
C:\Users\Ritvik\.venvs\agribot-convert\Scripts\python model/fetch_plantvillage.py --per-class 20 --fixtures
C:\Users\Ritvik\.venvs\agribot-convert\Scripts\python model/convert.py
C:\Users\Ritvik\.venvs\agribot-convert\Scripts\python -m pytest model/tests -q
C:\Users\Ritvik\.venvs\agribot-convert\Scripts\python model/eval.py --data model/data/plantvillage --preprocess both
C:\Users\Ritvik\.venvs\agribot-convert\Scripts\python model/eval.py --field ..\agribot-v1-archive\field-captures --preprocess both
```
