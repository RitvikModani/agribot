/*
  AgriBot camera firmware v2 — AI-Thinker ESP32-CAM

  Polls the AgriBot API for what to do, captures 640x480 JPEGs and uploads the
  raw bytes over verified HTTPS. No Wi-Fi password, URL or token lives in this
  file: they are entered once in the "AgriBot-Setup" portal and kept in NVS.

  Portal opens on first boot, or press RST twice within 3 s.
  Serial (115200): c = capture now, p = print config, r = forget config + portal.
  Board: "AI Thinker ESP32-CAM" (PSRAM enabled). See docs/firmware.md.
*/
#include <Arduino.h>
#include <HTTPClient.h>
#include <Preferences.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <WiFiManager.h>
#include <esp_system.h>
#include "esp_camera.h"
#include "img_converters.h"
#include "ca_cert.h"

// AI-Thinker camera pins
#define PWDN_GPIO_NUM 32
#define RESET_GPIO_NUM -1
#define XCLK_GPIO_NUM 0
#define SIOD_GPIO_NUM 26
#define SIOC_GPIO_NUM 27
#define Y9_GPIO_NUM 35
#define Y8_GPIO_NUM 34
#define Y7_GPIO_NUM 39
#define Y6_GPIO_NUM 36
#define Y5_GPIO_NUM 21
#define Y4_GPIO_NUM 19
#define Y3_GPIO_NUM 18
#define Y2_GPIO_NUM 5
#define VSYNC_GPIO_NUM 25
#define HREF_GPIO_NUM 23
#define PCLK_GPIO_NUM 22

constexpr int STATUS_LED = 33;  // red LED, active low
constexpr uint32_t POLL_MS = 2000;
constexpr uint32_t AUTH_BACKOFF_MS = 30000;
constexpr uint32_t WIFI_REBOOT_MS = 60000;
constexpr uint32_t DOUBLE_RESET_WINDOW_MS = 3000;
constexpr long STALE_REQUEST_S = 30;
constexpr int UPLOAD_ATTEMPTS = 3;
constexpr int HTTP_TIMEOUT_MS = 20000;
// 0-100, for sensors without a JPEG encoder. 60 keeps a 1280x720 photo near 27 KB (80 gave ~45 KB, which a
// weak phone-hotspot uplink couldn't send); Gemini gains more from the resolution than from JPEG polish.
constexpr int SOFT_JPEG_QUALITY = 60;

Preferences prefs;
WiFiClientSecure tls;
// One long-lived client: in esp32 core 2.0.x ~HTTPClient() calls stop() on the shared TLS client, so a
// per-request HTTPClient tore the connection down every time and each request paid a fresh 4-8 s handshake.
HTTPClient http;
String apiBase;
String deviceToken;
String lastHandledRequest;
uint32_t lastPollMs = 0;
uint32_t lastCaptureMs = 0;
uint32_t wifiDownSinceMs = 0;
bool resetFlagCleared = false;
bool authRejected = false;
bool cameraReady = false;
bool softJpeg = false;  // sensor has no JPEG encoder (e.g. GC2145): capture RGB565, encode on the ESP32
// Camera settings last applied (dashboard → Rover → Camera). 0 / false are the sensor's own defaults.
int appliedExposure = 0;
bool appliedMirror = false;
bool appliedFlip = false;

// ───────────────────────────── helpers ─────────────────────────────

void led(bool on) { digitalWrite(STATUS_LED, on ? LOW : HIGH); }

bool logPolls = false;  // 'v' on serial logs every check-in's time, not only the slow ones

void blink(int times, int onMs = 120, int offMs = 160) {
  for (int i = 0; i < times; ++i) {
    led(true);
    delay(onMs);
    led(false);
    delay(offMs);
  }
}

String maskedToken() {
  return deviceToken.length() > 8 ? deviceToken.substring(0, 8) + "…" : String("(none)");
}

String uuid4() {
  uint8_t b[16];
  esp_fill_random(b, sizeof b);
  b[6] = (b[6] & 0x0F) | 0x40;
  b[8] = (b[8] & 0x3F) | 0x80;
  char s[37];
  snprintf(s, sizeof s, "%02x%02x%02x%02x-%02x%02x-%02x%02x-%02x%02x-%02x%02x%02x%02x%02x%02x",
           b[0], b[1], b[2], b[3], b[4], b[5], b[6], b[7], b[8], b[9], b[10], b[11], b[12], b[13], b[14], b[15]);
  return String(s);
}

// Minimal readers for the API's fixed, flat JSON. Absent or null → empty / default.
int valueStart(const String& body, const char* key) {
  String k = String("\"") + key + "\":";
  int i = body.indexOf(k);
  if (i < 0) return -1;
  i += k.length();
  while (i < (int)body.length() && body[i] == ' ') ++i;
  return i;
}

String jsonString(const String& body, const char* key) {
  int i = valueStart(body, key);
  if (i < 0 || body[i] != '"') return "";
  int j = body.indexOf('"', i + 1);
  return j < 0 ? String("") : body.substring(i + 1, j);
}

bool jsonBool(const String& body, const char* key) {
  int i = valueStart(body, key);
  return i >= 0 && body.startsWith("true", i);
}

long jsonInt(const String& body, const char* key, long fallback) {
  int i = valueStart(body, key);
  if (i < 0) return fallback;
  const int digit = body[i] == '-' ? i + 1 : i;
  return isDigit(body[digit]) ? body.substring(i).toInt() : fallback;
}

// "YYYY-MM-DDTHH:MM:SSZ" → seconds since 1970 (UTC). -1 if unparseable.
long long isoToEpoch(const String& s) {
  int y, mo, d, h, mi, se;
  if (sscanf(s.c_str(), "%d-%d-%dT%d:%d:%d", &y, &mo, &d, &h, &mi, &se) != 6) return -1;
  y -= mo <= 2;
  const long era = (y >= 0 ? y : y - 399) / 400;
  const unsigned yoe = (unsigned)(y - era * 400);
  const unsigned doy = (153 * (mo + (mo > 2 ? -3 : 9)) + 2) / 5 + d - 1;
  const unsigned doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
  const long long days = era * 146097LL + (long long)doe - 719468;
  return days * 86400 + h * 3600 + mi * 60 + se;
}

// ───────────────────────────── config ─────────────────────────────

void loadConfig() {
  prefs.begin("agribot", true);
  apiBase = prefs.getString("api", "");
  deviceToken = prefs.getString("token", "");
  prefs.end();
}

bool doubleResetDetected() {
  prefs.begin("agribot", false);
  bool armed = prefs.getBool("rst_armed", false);
  prefs.putBool("rst_armed", true);
  prefs.end();
  return armed;
}

void disarmDoubleReset() {
  prefs.begin("agribot", false);
  prefs.putBool("rst_armed", false);
  prefs.end();
}

void runPortal() {
  Serial.println("[setup] opening portal: join Wi-Fi \"AgriBot-Setup\" and open 192.168.4.1");
  disarmDoubleReset();
  WiFiManager wm;
  WiFiManagerParameter apiField("api", "API URL (https://<you>-agribot-api.hf.space)", apiBase.c_str(), 120);
  WiFiManagerParameter tokenField("token", "Device token (agb_…). Leave blank to keep the current one", "", 80);
  wm.addParameter(&apiField);
  wm.addParameter(&tokenField);
  wm.setConfigPortalTimeout(300);
  led(true);
  bool saved = wm.startConfigPortal("AgriBot-Setup");
  led(false);
  if (saved) {
    String api = String(apiField.getValue());
    api.trim();
    while (api.endsWith("/")) api.remove(api.length() - 1);
    String token = String(tokenField.getValue());
    token.trim();
    prefs.begin("agribot", false);
    if (api.length()) prefs.putString("api", api);
    if (token.length()) prefs.putString("token", token);
    prefs.end();
    Serial.println("[setup] saved");
  }
  ESP.restart();
}

// ───────────────────────────── camera ─────────────────────────────

// True when the sensor delivers a complete raw frame at the current size (short or missing frames mean it can't keep up).
bool grabsFullFrame() {
  camera_fb_t* fb = esp_camera_fb_get();
  if (!fb) return false;
  const bool full = fb->len >= (size_t)fb->width * fb->height * 2 * 9 / 10;
  esp_camera_fb_return(fb);
  return full;
}

// The double-reset window is 3 s from boot. Close it from wherever setup happens to be by then.
void closeResetWindowIfDue() {
  if (!resetFlagCleared && millis() > DOUBLE_RESET_WINDOW_MS) {
    disarmDoubleReset();
    resetFlagCleared = true;
  }
}

bool startCamera() {
  camera_config_t c = {};
  c.ledc_channel = LEDC_CHANNEL_0;
  c.ledc_timer = LEDC_TIMER_0;
  c.pin_d0 = Y2_GPIO_NUM;
  c.pin_d1 = Y3_GPIO_NUM;
  c.pin_d2 = Y4_GPIO_NUM;
  c.pin_d3 = Y5_GPIO_NUM;
  c.pin_d4 = Y6_GPIO_NUM;
  c.pin_d5 = Y7_GPIO_NUM;
  c.pin_d6 = Y8_GPIO_NUM;
  c.pin_d7 = Y9_GPIO_NUM;
  c.pin_xclk = XCLK_GPIO_NUM;
  c.pin_pclk = PCLK_GPIO_NUM;
  c.pin_vsync = VSYNC_GPIO_NUM;
  c.pin_href = HREF_GPIO_NUM;
  c.pin_sccb_sda = SIOD_GPIO_NUM;
  c.pin_sccb_scl = SIOC_GPIO_NUM;
  c.pin_pwdn = PWDN_GPIO_NUM;
  c.pin_reset = RESET_GPIO_NUM;
  c.xclk_freq_hz = 20000000;
  c.pixel_format = PIXFORMAT_JPEG;
  c.frame_size = FRAMESIZE_VGA;  // 640x480
  c.jpeg_quality = 12;
  c.fb_count = 2;
  c.fb_location = CAMERA_FB_IN_PSRAM;
  c.grab_mode = CAMERA_GRAB_LATEST;

  if (!psramFound()) {
    Serial.println("[camera] no PSRAM — select the AI Thinker ESP32-CAM board with PSRAM enabled");
    return false;
  }
  esp_err_t err = esp_camera_init(&c);
  if (err == ESP_ERR_NOT_SUPPORTED) {
    // Cheaper AI-Thinker boards ship a GC2145, which has no JPEG encoder. Capture raw and encode here.
    esp_camera_deinit();
    c.pixel_format = PIXFORMAT_RGB565;
    c.fb_count = 1;
    c.xclk_freq_hz = 10000000;  // raw RGB565 at 20 MHz overflows the DMA (cam_hal: EV-EOF-OVF)
    // GRAB_LATEST streams raw frames into PSRAM non-stop; at 1280x720 that starved Wi-Fi/TLS (18 s handshakes,
    // failed uploads). WHEN_EMPTY fills one frame and stops until it's taken; capture drops it and takes a fresh one.
    c.grab_mode = CAMERA_GRAB_WHEN_EMPTY;
    // A whole plant needs pixels: take the largest size that actually delivers a full frame.
    const framesize_t sizes[] = {FRAMESIZE_HD, FRAMESIZE_SVGA, FRAMESIZE_VGA};
    for (framesize_t size : sizes) {
      closeResetWindowIfDue();
      c.frame_size = size;
      err = esp_camera_init(&c);
      if (err == ESP_OK && grabsFullFrame()) break;
      Serial.printf("[camera] frame size %d unusable (0x%x), trying smaller\n", (int)size, err);
      if (err == ESP_OK) esp_camera_deinit();
      err = ESP_FAIL;
    }
    softJpeg = err == ESP_OK;
  }
  if (err != ESP_OK) {
    Serial.printf("[camera] init failed 0x%x\n", err);
    return false;
  }
  sensor_t* s = esp_camera_sensor_get();
  // Not every sensor driver implements every control.
  if (s->set_whitebal) s->set_whitebal(s, 1);
  if (s->set_awb_gain) s->set_awb_gain(s, 1);
  if (s->set_exposure_ctrl) s->set_exposure_ctrl(s, 1);
  if (s->set_gain_ctrl) s->set_gain_ctrl(s, 1);
  // Let auto white balance settle: the first frames carry the OV2640's yellow-green tint.
  unsigned width = 0, height = 0;
  for (int i = 0; i < 5; ++i) {
    camera_fb_t* fb = esp_camera_fb_get();
    if (fb) {
      width = fb->width;
      height = fb->height;
      esp_camera_fb_return(fb);
    }
    delay(100);
  }
  Serial.printf("[camera] ready %ux%u, sensor 0x%x, %s\n", width, height, s->id.PID, softJpeg ? "JPEG encoded in software" : "hardware JPEG");
  return true;
}

// The GC2145 driver has no exposure setter. Its auto-exposure aims at a brightness target on register page 1
// (0x13, default 0x40) inside a low/high limit (0x23 = 0x20, 0x15 = 0x50); move all three by the same amount.
void setGc2145Exposure(sensor_t* s, int level) {
  const int target = 0x40 + 12 * level;  // -2..+2 → 0x28..0x58
  s->set_reg(s, 0xfe, 0xff, 0x01);       // page 1 (set_reg doesn't select the page itself)
  s->set_reg(s, 0x13, 0xff, target);
  s->set_reg(s, 0x23, 0xff, target - 0x20);
  s->set_reg(s, 0x15, 0xff, target + 0x10);
  s->set_reg(s, 0xfe, 0xff, 0x00);  // back to page 0, which the driver's own writes assume
}

// Applies only what changed, so the 2 s check-in costs nothing when the settings are unchanged.
void applyCameraSettings(int exposure, bool mirror, bool flip) {
  if (!cameraReady) return;
  sensor_t* s = esp_camera_sensor_get();
  exposure = constrain(exposure, -2, 2);
  if (exposure != appliedExposure) {
    if (s->id.PID == GC2145_PID) setGc2145Exposure(s, exposure);
    else if (s->set_ae_level) s->set_ae_level(s, exposure);  // OV2640 and friends
    appliedExposure = exposure;
    Serial.printf("[camera] exposure %+d\n", exposure);
  }
  if (mirror != appliedMirror) {
    s->set_hmirror(s, mirror);
    appliedMirror = mirror;
    Serial.printf("[camera] mirror %s\n", mirror ? "on" : "off");
  }
  if (flip != appliedFlip) {
    s->set_vflip(s, flip);
    appliedFlip = flip;
    Serial.printf("[camera] flip %s\n", flip ? "on" : "off");
  }
}

// Mean brightness 0-255 of an RGB565 frame from every 8th pixel of every 8th row: the number to tune exposure by.
int meanLuma(const camera_fb_t* fb) {
  uint32_t sum = 0, n = 0;
  for (size_t y = 0; y < fb->height; y += 8) {
    for (size_t x = 0; x < fb->width; x += 8) {
      const uint8_t* px = fb->buf + 2 * (y * fb->width + x);
      const uint16_t p = (px[0] << 8) | px[1];  // big-endian, as frame2jpg reads it
      const uint32_t r = (p >> 11) << 3, g = ((p >> 5) & 0x3f) << 2, b = (p & 0x1f) << 3;
      sum += (77 * r + 150 * g + 29 * b) >> 8;
      ++n;
    }
  }
  return n ? (int)(sum / n) : -1;
}

// ───────────────────────────── network ─────────────────────────────

bool beginRequest(HTTPClient& http, const String& path) {
  http.setReuse(true);
  http.setConnectTimeout(HTTP_TIMEOUT_MS);
  http.setTimeout(HTTP_TIMEOUT_MS);
  if (!http.begin(tls, apiBase + path)) return false;
  http.addHeader("X-Device-Token", deviceToken);
  http.setUserAgent("AgriBot-CAM/2");
  return true;
}

int postJpeg(const uint8_t* buf, size_t len, const String& captureId, const char* trigger) {
  if (!beginRequest(http, "/v1/captures")) return -1;
  http.addHeader("Content-Type", "image/jpeg");
  http.addHeader("X-Capture-Id", captureId);
  http.addHeader("X-Trigger", trigger);
  const bool reused = tls.connected();
  const uint32_t started = millis();
  int code = http.POST(const_cast<uint8_t*>(buf), len);  // sent straight from the frame buffer
  const uint32_t tookMs = millis() - started;
  if (code > 0) Serial.printf("[upload] %d in %u ms (%s) %s\n", code, tookMs, reused ? "reused TLS" : "new TLS", http.getString().c_str());
  else Serial.printf("[upload] error %s after %u ms\n", http.errorToString(code).c_str(), tookMs);
  http.end();
  return code;
}

void captureAndUpload(const char* trigger) {
  if (!cameraReady) {
    Serial.println("[capture] camera not ready (see the [camera] line at boot)");
    blink(3);
    return;
  }
  const uint32_t started = millis();
  camera_fb_t* stale = esp_camera_fb_get();  // drop the buffered frame; we want "now"
  if (stale) esp_camera_fb_return(stale);
  camera_fb_t* fb = esp_camera_fb_get();
  if (!fb) {
    Serial.println("[capture] no frame");
    blink(3);
    return;
  }
  lastCaptureMs = millis();
  const uint32_t grabMs = lastCaptureMs - started;
  const uint8_t* jpeg = fb->buf;
  size_t jpegLen = fb->len;
  uint8_t* encoded = nullptr;  // owned here when the sensor needed software encoding
  const int luma = softJpeg ? meanLuma(fb) : -1;
  if (softJpeg) {
    const bool ok = frame2jpg(fb, SOFT_JPEG_QUALITY, &encoded, &jpegLen);
    esp_camera_fb_return(fb);  // the raw frame is no longer needed
    fb = nullptr;
    if (!ok) {
      Serial.println("[capture] JPEG encode failed");
      blink(3);
      return;
    }
    jpeg = encoded;
  }
  const String id = uuid4();
  Serial.printf("[capture] %s %u bytes (%s), frame %u ms, encode %u ms, luma %d, exposure %+d\n", id.c_str(), jpegLen,
                trigger, grabMs, (uint32_t)(millis() - lastCaptureMs), luma, appliedExposure);
  int code = -1;
  for (int attempt = 0; attempt < UPLOAD_ATTEMPTS; ++attempt) {
    code = postJpeg(jpeg, jpegLen, id, trigger);
    if (code == 200 || code == 201) break;
    if (code == 401 || code == 403) {
      authRejected = true;
      break;
    }
    if (code >= 400 && code < 500 && code != 429) break;  // a retry won't fix a bad request
    delay(1000u << attempt);                               // 1 s, 2 s, 4 s
  }
  if (fb) esp_camera_fb_return(fb);
  free(encoded);
  if (code == 200 || code == 201) blink(1, 200);
  else if (authRejected) blink(2, 600, 300);
  else blink(3);
}

void pollState() {
  if (!beginRequest(http, "/v1/device/state")) return;
  const bool reused = tls.connected();
  const uint32_t started = millis();
  int code = http.GET();
  String body = code > 0 ? http.getString() : String("");
  http.end();
  const uint32_t tookMs = millis() - started;
  if (tookMs > 1500 || logPolls) {
    Serial.printf("[state] %spoll %u ms (%s)\n", tookMs > 1500 ? "slow " : "", tookMs, reused ? "reused TLS" : "new TLS");
  }
  if (code == 401 || code == 403) {
    if (!authRejected) Serial.println("[state] token rejected — run the portal (double reset) and paste a new token");
    authRejected = true;
    blink(2, 600, 300);
    return;
  }
  if (code != 200) {
    Serial.printf("[state] HTTP %d\n", code);
    return;
  }
  authRejected = false;
  if (valueStart(body, "cam_exposure") >= 0) {  // older APIs don't send camera settings
    applyCameraSettings(jsonInt(body, "cam_exposure", 0), jsonBool(body, "cam_hmirror"), jsonBool(body, "cam_vflip"));
  }

  const String requested = jsonString(body, "capture_requested_at");
  const long long serverNow = isoToEpoch(jsonString(body, "server_time"));
  if (requested.length() && requested != lastHandledRequest) {
    lastHandledRequest = requested;  // act once per request, success or not
    const long long age = serverNow - isoToEpoch(requested);
    if (age >= 0 && age <= STALE_REQUEST_S) captureAndUpload("manual");
    else Serial.printf("[state] ignoring request %llds old\n", age);
    return;
  }
  if (jsonBool(body, "patrol_on")) {
    const long interval = jsonInt(body, "patrol_interval_s", 10);
    if (millis() - lastCaptureMs >= (uint32_t)interval * 1000u) captureAndUpload("patrol");
  }
}

void watchWifi() {
  if (WiFi.status() == WL_CONNECTED) {
    wifiDownSinceMs = 0;
    return;
  }
  if (wifiDownSinceMs == 0) {
    wifiDownSinceMs = millis();
    Serial.println("[wifi] lost — reconnecting");
  } else if (millis() - wifiDownSinceMs > WIFI_REBOOT_MS) {
    Serial.println("[wifi] down 60 s — rebooting");
    ESP.restart();
  }
}

void handleSerial() {
  if (!Serial.available()) return;
  const int c = Serial.read();
  switch (c) {
    case 'c':
      captureAndUpload("manual");
      break;
    case 'p':
      Serial.printf("api=%s token=%s wifi=%s ip=%s rssi=%d\n", apiBase.c_str(), maskedToken().c_str(),
                    WiFi.SSID().c_str(), WiFi.localIP().toString().c_str(), WiFi.RSSI());
      // TLS needs ~40 KB of contiguous internal RAM; the camera's DMA buffers compete for it.
      Serial.printf("heap internal free=%u largest=%u psram free=%u\n", heap_caps_get_free_size(MALLOC_CAP_INTERNAL),
                    heap_caps_get_largest_free_block(MALLOC_CAP_INTERNAL), heap_caps_get_free_size(MALLOC_CAP_SPIRAM));
      Serial.printf("camera exposure=%+d mirror=%d flip=%d\n", appliedExposure, appliedMirror, appliedFlip);
      break;
    case 'v':
      logPolls = !logPolls;
      break;
    case '+':  // bench only: the next check-in restores the dashboard's value
    case '-':
      applyCameraSettings(appliedExposure + (c == '+' ? 1 : -1), appliedMirror, appliedFlip);
      break;
    case 'r':
      prefs.begin("agribot", false);
      prefs.clear();
      prefs.end();
      WiFi.disconnect(true, true);
      runPortal();
      break;
  }
}

// ───────────────────────────── main ─────────────────────────────

void setup() {
  Serial.begin(115200);
  pinMode(STATUS_LED, OUTPUT);
  led(false);
  Serial.println("\n[boot] AgriBot camera v2");

  const bool doubleReset = doubleResetDetected();
  loadConfig();
  if (doubleReset || apiBase.isEmpty() || deviceToken.isEmpty()) runPortal();  // restarts

  cameraReady = startCamera();
  closeResetWindowIfDue();
  tls.setCACert(API_ROOT_CAS);

  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(true);
  // Radio always awake. Modem sleep was tried for heat (2026-10-31): check-ins were unchanged, but uploads on
  // the phone hotspot went from 3-12 s to 15-42 s (some failed), even with sleep switched off around each
  // request. A 15 dBm transmit cap didn't help either. Heat is handled physically (airflow), not here.
  WiFi.setSleep(false);
  WiFi.begin();  // credentials saved by the portal
  const uint32_t started = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - started < 20000) {
    blink(1, 60, 60);
    // A second reset while still connecting (power blip, USB serial opening) must not open the portal.
    closeResetWindowIfDue();
  }
  Serial.printf("[wifi] %s %s\n", WiFi.status() == WL_CONNECTED ? "connected" : "not yet connected",
                WiFi.localIP().toString().c_str());
}

void loop() {
  closeResetWindowIfDue();
  handleSerial();
  watchWifi();
  const uint32_t interval = authRejected ? AUTH_BACKOFF_MS : POLL_MS;
  if (WiFi.status() == WL_CONNECTED && millis() - lastPollMs >= interval) {
    lastPollMs = millis();
    pollState();
  }
  delay(20);
}
