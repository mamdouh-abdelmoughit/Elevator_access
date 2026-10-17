// ==========================================================================
//   DIAGNOSTIC: raw pin-level sniffer on the ESP32's CAN RX line (GPIO5)
// ==========================================================================
// Does NOT run the TWAI driver at all — just watches the SN65HVD230's R
// (receiver output) pin directly with a microsecond-timestamped interrupt,
// so we can see the actual bit pattern/timing arriving on the bus,
// independent of whatever the TWAI decoder concludes about it.
//
// CAN_TX_PIN is held HIGH (recessive) the whole time so this node never
// transmits or interferes with the bus — it's a passive listener only.
// ==========================================================================

#include <Arduino.h>

#define CAN_TX_PIN 4
#define CAN_RX_PIN 5
#define MAX_EDGES  600

volatile unsigned long edgeTimes[MAX_EDGES];
volatile uint8_t edgeLevels[MAX_EDGES];
volatile int edgeCount = 0;
volatile bool capturing = false;

void IRAM_ATTR onEdge() {
  if (!capturing) return;
  int i = edgeCount;
  if (i < MAX_EDGES) {
    edgeTimes[i] = micros();
    edgeLevels[i] = digitalRead(CAN_RX_PIN);
    edgeCount = i + 1;
  } else {
    capturing = false;
  }
}

void setup() {
  Serial.begin(115200);
  delay(1000);
  Serial.println("\n--- CAN RAW PIN SNIFFER (GPIO5 = CRX) ---");

  pinMode(CAN_TX_PIN, OUTPUT);
  digitalWrite(CAN_TX_PIN, HIGH); // hold recessive, never transmit/interfere

  pinMode(CAN_RX_PIN, INPUT);
  Serial.print("Idle level on CRX (GPIO5) right now: ");
  Serial.println(digitalRead(CAN_RX_PIN));

  attachInterrupt(digitalPinToInterrupt(CAN_RX_PIN), onEdge, CHANGE);

  noInterrupts();
  edgeCount = 0;
  capturing = true;
  interrupts();

  Serial.println("Armed. Badge the card now...\n");
}

void loop() {
  static unsigned long lastChangeMillis = 0;
  static int lastSeenCount = -1;

  int count;
  noInterrupts();
  count = edgeCount;
  interrupts();

  if (count != lastSeenCount) {
    lastSeenCount = count;
    lastChangeMillis = millis();
  }

  bool bufferFull = (count >= MAX_EDGES);
  bool quietAfterActivity = (count > 0) && (millis() - lastChangeMillis > 300);

  if (bufferFull || quietAfterActivity) {
    noInterrupts();
    capturing = false;
    int n = edgeCount;
    interrupts();

    Serial.printf("=== Captured %d edges ===\n", n);
    unsigned long prev = 0;
    for (int i = 0; i < n; i++) {
      unsigned long t = edgeTimes[i];
      long delta = (i == 0) ? 0 : (long)(t - prev);
      Serial.printf("edge[%3d] t=%10lu us  level=%d  delta=%6ld us\n", i, t, edgeLevels[i], delta);
      prev = t;
    }
    Serial.println("=== end capture ===\n");
    Serial.println("Re-armed. Badge again...\n");

    noInterrupts();
    edgeCount = 0;
    capturing = true;
    interrupts();
  }
}
