// ==========================================================================
//   BIOSWITCH — CABIN BRIDGE (Arduino Nano)
// ==========================================================================
// Sits inside the elevator cabin, between the single RFID reader and the
// CAN bus that runs up the shaft to the ESP32-S3 master (main_cabin_can.cpp).
// It is a dumb transcoder: decode the Wiegand card scan, put it on the CAN
// bus. No access decisions happen here — that's the master's job.
//
// Wiring:
//   Reader D0 -> Nano D2 (INT0)   Reader D1 -> Nano D3 (INT1)
//   MCP2515 module: MOSI D11, MISO D12, SCK D13 (hardware SPI), CS D10
//   (MCP2515 INT pin is left unconnected — this node only transmits)
//
// See esp32/docs/CABIN_CAN_4G_MIGRATION.md for the CAN frame format and
// the overall wiring walkthrough.
// ==========================================================================

#include <Arduino.h>
#include <SPI.h>
#include <mcp_can.h>

// --- READER PINS ---
#define READER_D0 2  // INT0
#define READER_D1 3  // INT1

// --- MCP2515 ---
#define MCP2515_CS_PIN 10
#define MCP2515_CRYSTAL MCP_8MHZ // CONFIRM: most cheap MCP2515+TJA1050 boards use an 8MHz can; some use 16MHz — check yours
#define CAN_CARD_ID 0x100        // must match main_cabin_can.cpp

MCP_CAN CAN0(MCP2515_CS_PIN);

// --- MANUAL WIEGAND DATA STORAGE (same bit-bang technique as the ESP32 readers) ---
volatile unsigned long r_code = 0;
volatile int r_bitCount = 0;
volatile unsigned long r_lastPulseTime = 0;
volatile unsigned long r_lastMicros = 0;

void isr_d0() {
  unsigned long now = micros();
  if (now - r_lastMicros > 1500) {
    r_code <<= 1; r_bitCount++; r_lastMicros = now; r_lastPulseTime = millis();
  }
}
void isr_d1() {
  unsigned long now = micros();
  if (now - r_lastMicros > 1500) {
    r_code <<= 1; r_code |= 1; r_bitCount++; r_lastMicros = now; r_lastPulseTime = millis();
  }
}

void sendCardOverCan(unsigned long cardCode) {
  byte buf[8];
  buf[0] = (byte)(cardCode & 0xFF);
  buf[1] = (byte)((cardCode >> 8) & 0xFF);
  buf[2] = (byte)((cardCode >> 16) & 0xFF);
  buf[3] = (byte)((cardCode >> 24) & 0xFF);
  buf[4] = 0x01; // reader/source id — fixed at 1, only reader in the cabin
  buf[5] = 0x00; buf[6] = 0x00; buf[7] = 0x00;

  // mcp_can's abortTX() sets the MCP2515's ABAT bit and never clears it again -- once
  // called, every future transmission is silently crippled (can't properly auto-retry).
  // That's why only the very first swipe (before any abortTX() call ever happened)
  // worked reliably. A full re-init resets every register, including that stuck bit --
  // same effect as the power-cycle that always fixed it, done here in software after
  // each bounded retry window instead of leaving the frame to retry forever.
  CAN0.sendMsgBuf(CAN_CARD_ID, 0 /* standard ID */, 8, buf);
  delay(120);
  CAN0.begin(MCP_ANY, CAN_125KBPS, MCP2515_CRYSTAL);
  CAN0.setMode(MCP_NORMAL);
  Serial.print("CAN TX window done (reinit), card: "); Serial.println(cardCode);
}

void setup() {
  Serial.begin(115200);
  delay(500);
  Serial.println("\n--- BIOSWITCH: CABIN BRIDGE (Nano) READY ---");

  while (CAN0.begin(MCP_ANY, CAN_125KBPS, MCP2515_CRYSTAL) != CAN_OK) {
    Serial.println("MCP2515 init failed, retrying...");
    delay(500);
  }
  CAN0.setMode(MCP_NORMAL);
  Serial.println("MCP2515 CAN bus up (125 kbps).");

  pinMode(READER_D0, INPUT_PULLUP);
  pinMode(READER_D1, INPUT_PULLUP);
  attachInterrupt(digitalPinToInterrupt(READER_D0), isr_d0, FALLING);
  attachInterrupt(digitalPinToInterrupt(READER_D1), isr_d1, FALLING);
}

void loop() {
  if (r_bitCount > 0 && (millis() - r_lastPulseTime > 50)) {
    noInterrupts();
    unsigned long rawCode = r_code;
    int bits = r_bitCount;
    r_code = 0; r_bitCount = 0;
    interrupts();

    if (bits >= 26) {
      unsigned long cleanCode = (rawCode >> 1) & 0x00FFFFFF; // same decode as main.cpp
      Serial.print("Scanned: bits="); Serial.print(bits);
      Serial.print(" raw="); Serial.print(rawCode);
      Serial.print(" clean="); Serial.println(cleanCode);
      sendCardOverCan(cleanCode);

      delay(500); // 💡 IMPORTANT : Laisse le temps aux tampons de respirer
    }
  }
}
