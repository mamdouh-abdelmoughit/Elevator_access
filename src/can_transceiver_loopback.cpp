// ==========================================================================
//   DIAGNOSTIC: raw SN65HVD230 transceiver loopback test (no TWAI, no bus)
// ==========================================================================
// Bypasses the TWAI peripheral entirely. Manually drives GPIO4 (D, the
// transceiver's driver input) high/low in a slow pattern, and reads back
// GPIO5 (R, the transceiver's receiver output) to see if it tracks.
//
// With nothing else on the bus, a healthy SN65HVD230 + correct wiring
// should show CRX following CTX almost immediately every time it toggles:
//   CTX=LOW  (dominant)  -> CRX should read LOW  shortly after
//   CTX=HIGH (recessive) -> CRX should read HIGH shortly after
//
// If CRX doesn't track CTX at all, or tracks inconsistently, that points
// at a fault in the SN65HVD230 chip itself, its power, or its D/R wiring.
// ==========================================================================

#include <Arduino.h>

#define CAN_TX_PIN 4 // to SN65HVD230 "D" (driver input)
#define CAN_RX_PIN 5 // from SN65HVD230 "R" (receiver output)

void setup() {
  Serial.begin(115200);
  delay(1000);
  Serial.println("\n--- SN65HVD230 RAW TRANSCEIVER LOOPBACK TEST ---");
  Serial.println("No TWAI, no bus protocol -- just driving D and reading R directly.");

  pinMode(CAN_TX_PIN, OUTPUT);
  pinMode(CAN_RX_PIN, INPUT);

  digitalWrite(CAN_TX_PIN, HIGH); // start recessive
  delay(200);
  Serial.printf("Idle: CTX=HIGH(recessive) -> CRX reads %d (expect 1)\n", digitalRead(CAN_RX_PIN));
}

void loop() {
  static bool dominant = false;
  static int passCount = 0, failCount = 0;

  dominant = !dominant;
  digitalWrite(CAN_TX_PIN, dominant ? LOW : HIGH);
  delay(50); // let the transceiver settle well beyond any bit-time timescale

  int rx = digitalRead(CAN_RX_PIN);
  int expected = dominant ? LOW : HIGH;
  bool ok = (rx == expected);
  if (ok) passCount++; else failCount++;

  Serial.printf("CTX=%s -> CRX=%s  expected=%s  %s   (pass=%d fail=%d)\n",
    dominant ? "LOW(dominant)" : "HIGH(recessive)",
    rx == LOW ? "LOW" : "HIGH",
    expected == LOW ? "LOW" : "HIGH",
    ok ? "OK" : "MISMATCH!!",
    passCount, failCount);

  delay(450);
}
