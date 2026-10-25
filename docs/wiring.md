# Drive wiring

Unchanged from the original Bluetooth car, plus **one new wire**.

| From | To | Note |
|---|---|---|
| HC-05 TXD | Uno D10 | SoftwareSerial RX |
| HC-05 RXD | Uno D11 | through a 1 kΩ / 2 kΩ divider if you have one (HC-05 RX is 3.3 V) |
| **HC-05 STATE** | **Uno D7** | **new** — HIGH while the phone is connected |
| L298N IN1 / IN2 / IN3 / IN4 | Uno D12 / D13 / A0 (D14) / A1 (D15) | as before |
| HC-05 VCC / GND | 5 V / GND | common ground with the L298N and Uno |

## How the failsafe behaves

- The motors only move while STATE is HIGH. The moment the phone disconnects, the HC-05 drops STATE and the Uno stops the motors on its next loop (well under 100 ms).
- **Without the STATE wire the pin floats and the rover may refuse to move or stop at random.** Connect it.
- Limit: if the rover drives **out of range** (rather than the phone disconnecting), the HC-05 only notices after its link-supervision timeout, which can be several seconds. Keep the demo inside ~5 m.
- STATE is 3.3 V logic; the Uno reads anything above ~3 V as HIGH, so it works directly. If it reads LOW while connected, your module's STATE pin may be unpopulated — check with a multimeter.
- Optional: set `CMD_TIMEOUT_MS` in the sketch (e.g. `400`) if your phone app keeps re-sending the command while a button is held. Then the rover also stops whenever you let go.
