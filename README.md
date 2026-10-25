# AgriBot

A low-cost rover that photographs tomato leaves and diagnoses disease from the cloud. Control it and read results from any phone or laptop.

```
ESP32-CAM ──HTTPS, raw JPEG + device token──▶ Inference API (FastAPI + ONNX, Hugging Face Space)
     ▲                                             │  verdict: confident / uncertain / no_leaf
     └──── polls "capture? patrol?" every 2 s ─────┤
                                                   ▼
                                Supabase: Postgres + row-level security, private storage, realtime
                                                   ▲
                Dashboard PWA (GitHub Pages) ──────┘  login · live capture · field log · device tokens

Arduino Uno + HC-05 ◀── phone Bluetooth (drive), stops on disconnect
```

| Folder | What | Status |
|---|---|---|
| `model/` | Teachable Machine model converted to ONNX; parity test; evaluation | ✅ parity ≤ 1e-4; 78.5% on a PlantVillage lab sample ([EVAL.md](model/EVAL.md)) |
| `api/` | Inference service | ✅ 31 tests |
| `supabase/` | Schema, row-level security, device-token functions | ✅ written · ⏳ apply to a project, run `rls_check.py` |
| `firmware/` | ESP32-CAM camera v2, Uno drive with failsafe | ✅ both compile · ⏳ flash + bench test |
| `web/` | Dashboard ("field instrument" design, [DESIGN.md](web/DESIGN.md)) | ✅ 8 tests, browser-checked at phone and laptop sizes in REPLAY mode · ⏳ against the live backend |

**Setting it up:** [docs/SETUP.md](docs/SETUP.md) · **Demo day:** [docs/demo-runbook.md](docs/demo-runbook.md) · **Design spec:** [docs/superpowers/specs/](docs/superpowers/specs/2026-10-25-agribot-core-loop-design.md)

## Honest limits

- Tomato only, 10 classes. 78.5% on lab photos; not yet validated in a field.
- The "no leaf" check is a colour heuristic: it rejects most non-plant frames, not all.
- v1's 151 recorded captures were indoor bench tests, not plants. See `model/EVAL.md`.

## Credits

PlantVillage dataset (Hughes & Salathé; Mohanty, Hughes & Salathé 2016) · Google Teachable Machine · drive sketch adapted from a robotics-course Bluetooth car exercise.
