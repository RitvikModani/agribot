# Personalisation roadmap

Asked for on 2026-10-25: choose your region, act on your weather, find remedy shops near you, local growing advice, plant search, plant recognition, and a better model than Teachable Machine. Split into four projects, built in this order, each finished before the next starts.

| # | Project | Status | Key decisions |
|---|---|---|---|
| 1 | **Region + weather** | done (2026-10-25) | Open-Meteo (free, no key) for forecast + 10-year climate; region saved in a `profiles` row; disease-risk and spray-window rules in the dashboard. Spec: `superpowers/specs/2026-10-25-region-weather-design.md` |
| 2 | **Remedy shops near you** | next | **Gemini with Grounding with Google Maps**, called from the API (key in HF secrets), cached per area + active ingredient for 24 h. Needs a Google Cloud billing account; the free allowance is 5,000 grounded prompts/month. Shops can't be checked for stock: the UI says "call ahead". OpenStreetMap was rejected: 3 unnamed agri shops within 30 km of Warangal. |
| 3 | **Grow guides + plant search** | later | Same Gemini key. A guide for any plant, grounded on the region's climate normals and forecast from project 1, returned as structured JSON and cached per plant + region. ISRIC SoilGrids was rejected: no data at Warangal. |
| 4 | **New disease model + plant recognition** | last | Replace Teachable Machine. Candidates: train our own MobileNetV3/EfficientNet on full PlantVillage (38 classes, 14 crops) and measure on PlantDoc field photos, or adopt CropGuard (ResNet50 ONNX, 38 classes). Plant species ID via the Pl@ntNet API (free, 500/day, needs a key). Decided in that project's own design. |
