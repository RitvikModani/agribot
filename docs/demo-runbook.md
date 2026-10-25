# Demo runbook

## Two days before

- [ ] Full rehearsal on the phone hotspot, including the 20-capture acceptance test.
- [ ] Record a 60-second video: phone screen + rover, one capture landing. This is the last-resort fallback.

## The day before

- [ ] Open the dashboard and sign in. This wakes Supabase, which pauses free projects after a week of no activity.
- [ ] Rover screen → **Wake API**. It wakes the Space, which sleeps after 48 h idle; the first wake can take a minute.
- [ ] One dry run, start to finish.
- [ ] Charge: rover battery, phone, power bank.
- [ ] Print 3–4 tomato-leaf photos from `model/data/plantvillage/` (one healthy, two diseased). Venues don't have tomato plants. A real tomato leaf in a zip bag is better still.

## On site, 30 minutes before

- [ ] Phone hotspot on, with the same name and password the camera was set up with.
- [ ] Rover on → red LED stops flickering → dashboard shows **Online** within 10 s.
- [ ] Rover screen → **Wake API** → HTTP 200.
- [ ] Two test captures on a printed leaf. Patrol **off**.
- [ ] Dashboard open on both phone and laptop. The laptop goes on the judges' side if there's a screen.

## The 90-second demo

1. "Farmers find disease late because scouting is slow. AgriBot goes and looks."
2. Drive the rover a little (phone Bluetooth app), then press **Capture** on the dashboard → the scan sweep runs → the verdict stamps in.
3. Point at the diagnosis: confidence blocks, top-3, treatment, and the "confirm with an extension officer" line.
4. Turn the camera at the table → **"No leaf in frame"**. "It refuses to diagnose what isn't a leaf. Version 1 called our ceiling blight."
5. **Field log**: every capture saved and filterable, viewable from any phone or laptop.
6. **Rover** screen: device token, revoke, and the honest model card (78.5% on lab photos, tomato only, field validation next).

## When things go wrong

| Problem | Do this |
|---|---|
| Mobile data dies | Open the dashboard with `?replay` on the end (e.g. `…/agribot/?replay#/live`). The hazard stripe shows it's recorded data — **say so out loud**. Still dead: play the video. |
| Rover shows offline | Check the hotspot is on and the camera has power. It reconnects by itself and reboots after 60 s without Wi-Fi. |
| Capture says "Not received" | Press it again. If it repeats, Wake API, then check the serial log (`docs/firmware.md`). |
| LED blinks twice, slowly | Token rejected. Rover → Issue new token → press RST twice → paste it in the portal. |
| Rover drives off | Disconnect Bluetooth on the phone. The motors stop (STATE-pin failsafe). |

## Honest answers for Q&A

- **Accuracy?** 78.5% on 200 PlantVillage lab photos, which may overlap the training set. Not measured on real fields yet; that's the next step.
- **Other crops?** Tomato only. Other plants get misread, which is why it shows confidence and an "uncertain" state.
- **Why cloud?** Any phone can see results, there's no laptop to keep on, and every capture is stored for later analysis.
- **Security?** Hashed per-device tokens, database row-level security, private image storage, verified HTTPS on the camera, and no passwords in the code.
