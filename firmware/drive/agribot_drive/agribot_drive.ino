/*
  AgriBot drive firmware — Arduino Uno + HC-05 + L298N

  Same pins and phone commands as the original bluetoothcar.ino:
    '1' forward  '2' backward  '3' right  '4' left  '0' stop
  New: motors stop the moment the HC-05 reports the phone disconnected
  (STATE pin → D7), and commands are only read when a byte has arrived.
  See docs/wiring.md.
*/
#include <SoftwareSerial.h>

SoftwareSerial bt(10, 11);  // RX, TX (to HC-05 TX, RX)

const uint8_t IN1 = 12, IN2 = 13, IN3 = 14, IN4 = 15;  // L298N inputs (14/15 = A0/A1)
const uint8_t BT_STATE_PIN = 7;                         // HC-05 STATE: HIGH while connected

// Optional: stop if no command arrives for this long. 0 = off.
// Turn on only if your phone app repeats the command while a button is held.
const unsigned long CMD_TIMEOUT_MS = 0;

bool moving = false;
bool wasLinked = false;
unsigned long lastCommandMs = 0;

void drive(uint8_t a, uint8_t b, uint8_t c, uint8_t d) {
  digitalWrite(IN1, a);
  digitalWrite(IN2, b);
  digitalWrite(IN3, c);
  digitalWrite(IN4, d);
  moving = a || b || c || d;
}

void stopMotors() { drive(LOW, LOW, LOW, LOW); }

void apply(char command) {
  switch (command) {
    case '1': drive(LOW, HIGH, HIGH, LOW); break;   // forward
    case '2': drive(HIGH, LOW, LOW, HIGH); break;   // backward
    case '3': drive(LOW, HIGH, LOW, HIGH); break;   // right
    case '4': drive(HIGH, LOW, HIGH, LOW); break;   // left
    case '0': stopMotors(); break;
    default: return;                                // ignore noise, \r, \n
  }
  lastCommandMs = millis();
}

void setup() {
  Serial.begin(9600);
  bt.begin(9600);
  pinMode(IN1, OUTPUT);
  pinMode(IN2, OUTPUT);
  pinMode(IN3, OUTPUT);
  pinMode(IN4, OUTPUT);
  pinMode(BT_STATE_PIN, INPUT);
  stopMotors();
  Serial.println(F("AgriBot drive: waiting for Bluetooth"));
}

void loop() {
  const bool linked = digitalRead(BT_STATE_PIN) == HIGH;
  if (!linked) {
    if (moving) stopMotors();
    while (bt.available() > 0) bt.read();  // drop anything queued before the link died
    if (wasLinked) Serial.println(F("Bluetooth lost: motors stopped"));
    wasLinked = false;
    return;
  }
  if (!wasLinked) Serial.println(F("Bluetooth connected"));
  wasLinked = true;

  if (bt.available() > 0) apply((char)bt.read());

  if (CMD_TIMEOUT_MS > 0 && moving && millis() - lastCommandMs > CMD_TIMEOUT_MS) stopMotors();
}
