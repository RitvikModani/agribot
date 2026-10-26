# Your setup steps

Everything that needs your accounts, your hands, or your hardware. About 90 minutes, once. Do them in order.

## 0. Retire v1 (10 min) — do this first

The old system's write URL is public on GitHub and two keys are sitting in Drive.

1. Sign in to the Google account that owns the live sheet (probably the old laptop's `advit` account). Open the sheet → **Extensions → Apps Script** → copy all the code into `..\agribot-v1-archive\apps-script.txt` (it's the only copy anywhere) → **Deploy → Manage deployments** → archive every deployment.
2. Same sheet: **File → Share → Publish to web → Stop publishing**.
3. GitHub → `RitvikModani/agrobot-final` → Settings → **Change visibility → Private**.
4. console.cloud.google.com → IAM & Admin → **Service accounts** → the account named in `service_account.json` → Keys → **delete the key**. Then delete `service_account.json` and the uploaded `.venv` folder from your Drive (`agrobot` folder).
5. Kindwise (crop.health) dashboard → **revoke the API key**. Delete `auto_flypix.py` from Drive.

## 1. Supabase — database, login, image storage (15 min)

If you've connected the **Supabase plugin**, tell me and I'll do steps 2–4 for you.

1. supabase.com → **New project** → name `agribot`, region **Mumbai**, generate a strong database password and keep it in your password manager.
2. **SQL Editor** → paste all of `supabase/migrations/0001_core.sql` → **Run**. It should finish with "Success. No rows returned". Then do the same with `0002_profiles.sql` (your saved region).
3. **Authentication → Sign In / Providers → Email** → turn **off** "Allow new users to sign up".
4. **Authentication → Users → Add user** → your email + a password → tick auto-confirm. (Add a second throwaway user too if you want to run the security check below.)
5. **Project Settings → API** → note the **Project URL**, the **anon public** key, and the **service_role** key. The service_role key is a master key: it only ever goes into the Hugging Face secret in step 2.
6. Optional proof the rules hold:
   ```
   set SUPABASE_URL=... & set SUPABASE_ANON_KEY=...
   set USER_A_EMAIL=... & set USER_A_PASSWORD=... & set USER_B_EMAIL=... & set USER_B_PASSWORD=...
   C:\Users\Ritvik\.venvs\agribot-api\Scripts\python supabase\tests\rls_check.py
   ```
   Every line should say PASS.

## 2. The API server (15 min)

**Render (recommended if Hugging Face limits your account):** render.com → sign up with GitHub → **New → Web Service** → pick the `agribot` repo → **Root Directory** `api` → **Language/Runtime** Docker → **Instance type** Free → add the same variables and secrets as in the Hugging Face table below (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `ALLOWED_ORIGINS`, `MAPS_GROUNDING`, `GEMINI_API_KEY`) → **Deploy**. Your URL is `https://<service-name>.onrender.com`; check `/healthz`. Free services sleep after 15 min idle and take up to a minute to wake: use **Wake API** before a demo.

### Or: Hugging Face Space

1. huggingface.co → **New Space** → name `agribot-api` → SDK **Docker** → **Blank** → visibility **Public** (the camera has to reach it without a Hugging Face login; the API checks its own device tokens and the code holds no secrets) → hardware **CPU basic (free)**.
2. Upload everything inside `agribot\api\` except `tests\`: the `app` and `model` folders, `Dockerfile`, `requirements.txt`, `README.md`, `.dockerignore`. Web: Files → Add file → Upload files (drag the folders in). Or tell me and I'll push it with the Hugging Face plugin.
3. Space **Settings → Variables and secrets**: add **secret** `SUPABASE_SERVICE_ROLE_KEY`, add **variable** `SUPABASE_URL`, and **variable** `ALLOWED_ORIGINS` = `https://ritvikmodani.github.io,http://localhost:5288` (lets the dashboard call the API from the browser).
   - **Gemini (grow guides, and shop names if billed):** aistudio.google.com → **Get API key** → **Create API key**. Add it to the Space as **secret** `GEMINI_API_KEY`. Optional variable `GEMINI_MODEL` (default `gemini-3.8-flash`; if that model has no free tier on your key, use a Flash-Lite model).
   - **No billing (free key):** also add **variable** `MAPS_GROUNDING` = `off`. Grow guides work on the free tier; in-app shop names need Maps grounding, which is paid-tier only, so the dashboard shows the Google Maps search link instead. To turn shop names on later, enable billing on the key's Google Cloud project and delete `MAPS_GROUNDING`.
4. Wait for **Running**, then open `https://<your-hf-username>-agribot-api.hf.space/healthz`. You should see `{"ok":true,"model_version":"tomato-tm-v1"}`.

## 3. GitHub + the dashboard (10 min)

1. Create an empty **public** repo `RitvikModani/agribot`, then push this folder. Say the word and I'll do it, after a final secret scan:
   ```
   git remote add origin https://github.com/RitvikModani/agribot.git
   git push -u origin main
   ```
2. Repo **Settings → Secrets and variables → Actions → Variables** (variables, not secrets — these are public values): `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_API_URL` (`https://<you>-agribot-api.hf.space`).
3. **Settings → Pages → Source: GitHub Actions**. Re-run the "dashboard" workflow. The site appears at `https://ritvikmodani.github.io/agribot/`.
4. Supabase → **Authentication → URL Configuration → Site URL** = that address.
5. Open it on your phone → sign in → browser menu → **Add to Home screen**.

The **secret-scan** workflow runs gitleaks on every push. If it ever goes red, stop and look before anything else.

## 4. The rover (20 min)

1. Dashboard → **Rover → Create rover** → copy the token (shown once).
2. Flash the camera and run the setup portal: `docs/firmware.md`. You'll need your hotspot name/password, the API URL and the token.
3. Add one wire: **HC-05 STATE → Uno D7** (`docs/wiring.md`), then flash `firmware/drive/agribot_drive`.
4. Work through the **bench checklist** in `docs/firmware.md`. The last item is the spec's acceptance test: 20 captures in a row, each under 5 s.

## 5. The deck

Make every slide true (spec §12):
- **Cloud, not "no internet".**
- **10 tomato diseases, not "healthy or diseased"**, and not "14 crops".
- **78.5% on a PlantVillage lab sample**, quoted with that caveat. No field accuracy claim.
- **Drop "verified on a test plot"** unless you actually run one: the v1 captures were indoor bench tests.
- **Real photos on slide 6.**
- **Credit:** say where the drive sketch came from, and credit anyone who helped.

## Local development

`cd web && npm run dev` runs the dashboard in **REPLAY** mode (no backend needed). Put real values in `web/.env.local` (copy `.env.example`) to point it at Supabase. API tests: `cd api && C:\Users\Ritvik\.venvs\agribot-api\Scripts\python -m pytest tests -q`.
