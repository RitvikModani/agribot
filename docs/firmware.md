# Firmware

Two boards, two sketches. Neither contains a password, URL or token.

| Board | Sketch | Arduino IDE board | Libraries |
|---|---|---|---|
| AI-Thinker ESP32-CAM | `firmware/camera/agribot_camera/` | **AI Thinker ESP32-CAM** (esp32 core 2.0.14 or newer; PSRAM is on by default) | **WiFiManager** by tzapu 2.0.17 (Library Manager) |
| Arduino Uno + HC-05 | `firmware/drive/agribot_drive/` | **Arduino Uno** | none |

Verified to compile on 2026-10-25: camera 1,112,585 bytes (35% of flash), drive 3,616 bytes.

## Flash the camera

1. Put the ESP32-CAM on its programmer (ESP32-CAM-MB, or an FTDI adapter with **IO0 → GND**).
2. Arduino IDE → open `agribot_camera.ino` → Tools → Board → **AI Thinker ESP32-CAM** → pick the COM port → Upload.
3. FTDI only: remove the IO0 jumper and press RST.
4. Serial Monitor at **115200** should print `[boot] AgriBot camera v2`.

## First-time setup (the portal)

On first boot (or press **RST twice within 3 s**) the red LED stays on and the board opens a Wi-Fi network called **AgriBot-Setup**.

1. Turn on your phone hotspot.
2. On a laptop or second phone, join **AgriBot-Setup** → a page opens (or browse to `192.168.4.1`) → **Configure WiFi**.
3. Pick your hotspot, type its password.
4. **API URL**: `https://<your-hf-username>-agribot-api.hf.space` (no trailing slash).
5. **Device token**: the `agb_…` token from the dashboard's Device page. Leave blank later if you only want to change Wi-Fi.
6. Save. The board restarts and joins the hotspot.

The portal closes itself after 5 minutes. It has no password, so only open it when you're holding the board.

## Status LED (red, on the back)

| Pattern | Meaning |
|---|---|
| Solid on | Setup portal open |
| Fast flicker | Connecting to Wi-Fi |
| 1 long blink | Upload OK |
| 3 short blinks | Capture or upload failed |
| 2 slow blinks | Token rejected — open the portal and paste a new token |

## Serial commands (115200)

`c` capture now · `p` print config (token masked) · `r` forget everything and open the portal

## TLS root certificates

`ca_cert.h` trusts **Amazon Root CA 1** (what `*.hf.space` chains to on 2026-10-25, via Amazon RSA 2048 M01), plus Starfield Services Root CA G2 and ISRG Root X1 as fallbacks. They expire 2035–2038. If uploads fail with a TLS error after Hugging Face changes provider, check the chain and regenerate:

```
echo | openssl s_client -connect <you>-agribot-api.hf.space:443 -servername <you>-agribot-api.hf.space -showcerts | grep -E "s:|i:"
```

Then extract the new root from `C:\Program Files\Git\mingw64\etc\ssl\certs\ca-bundle.crt` (each certificate is preceded by `# <Name>`) into `ca_cert.h`.

## Bench checklist (before the demo)

Run with Serial Monitor open and the dashboard on your phone.

- [ ] Boot prints `[camera] ready 640x480` and `[wifi] connected`
- [ ] Dashboard shows the rover **online** within 10 s
- [ ] Press **Capture** on the dashboard → serial shows `[upload] 201` → result on the dashboard within 5 s
- [ ] Point at a wall → result says **No leaf in frame**
- [ ] Turn on **Patrol** at 10 s → a capture every ~10 s; turn off → captures stop
- [ ] Turn the hotspot off for 20 s → dashboard shows offline → hotspot on → back online without touching the board
- [ ] Dashboard → Device → **Revoke** → within 60 s the LED shows 2 slow blinks → **New token** → portal → paste → works again
- [ ] 20 captures in a row succeed (spec acceptance test)
