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

**Sensor:** many AI-Thinker boards now ship a **GC2145** instead of the OV2640. It has no JPEG encoder, so the firmware captures raw RGB565 and encodes the JPEG on the ESP32 (under a second). The boot log says which: `[camera] ready 640x480, sensor 0x2145, JPEG encoded in software` (GC2145) or `sensor 0x26, hardware JPEG` (OV2640). On a GC2145 the line `E (950) camera: JPEG format is not supported on this sensor` just before it is expected, and occasional `cam_hal: FB-SIZE: 610560 != 614400` lines are short frames the driver drops and retries.

## First-time setup (the portal)

On first boot (or press **RST twice within 3 s**) the red LED stays on and the board opens a Wi-Fi network called **AgriBot-Setup**.

1. Turn on your phone hotspot.
2. On a laptop or second phone, join **AgriBot-Setup** → a page opens (or browse to `192.168.4.1`) → **Configure WiFi**.
3. Pick your hotspot, type its password.
4. **API URL**: `https://agribot-api-vi4m.onrender.com` (no trailing slash).
5. **Device token**: the `agb_…` token from the dashboard's Rover page (**Issue new token**). Leave blank later if you only want to change Wi-Fi.
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

`ca_cert.h` trusts **GTS Root R4** (what `*.onrender.com` chains to on 2026-10-27, via Google's WE1, cross-signed by GlobalSign Root CA), plus GTS Root R1 and GlobalSign Root CA, and the Hugging Face roots (Amazon Root CA 1, Starfield G2, ISRG Root X1) in case the API moves back. The earliest expiry is GlobalSign Root CA in January 2028. If uploads fail with a TLS error after the host changes provider, check the chain and regenerate:

```
echo | openssl s_client -connect agribot-api-vi4m.onrender.com:443 -servername agribot-api-vi4m.onrender.com -showcerts | grep -E "s:|i:"
```

Then extract the new root from `C:\Program Files\Git\mingw64\etc\ssl\certs\ca-bundle.crt` (each certificate is preceded by `# <Name>`) into `ca_cert.h`.

## Bench checklist (before the demo)

Run with Serial Monitor open and the dashboard on your phone.

- [ ] Boot prints `[camera] ready 640x480, sensor …` and `[wifi] connected`
- [ ] Dashboard shows the rover **online** within 10 s
- [ ] Press **Capture** on the dashboard → serial shows `[upload] 201` → result on the dashboard within 5 s
- [ ] Point at a wall → result says **No leaf in frame**
- [ ] Turn on **Patrol** at 10 s → a capture every ~10 s; turn off → captures stop
- [ ] Turn the hotspot off for 20 s → dashboard shows offline → hotspot on → back online without touching the board
- [ ] Dashboard → Device → **Revoke** → within 60 s the LED shows 2 slow blinks → **New token** → portal → paste → works again
- [ ] 20 captures in a row succeed (spec acceptance test)
