// ==========================================================================
//   DIAGNOSTIC: ESP32-S3 TWAI self-test (no external node required)
// ==========================================================================
// Isolates whether the ESP32-S3 + SN65HVD230 + its wiring can transmit and
// receive a frame through the actual analog CAN bus on their own, without
// relying on the Nano/MCP2515 to exist or ACK anything.
//
// Uses TWAI_MODE_NO_ACK (no external ACK required) plus the self-reception
// message flag, so a healthy chain should report PASS every second even
// with nothing else connected to the bus.
// ==========================================================================

#include <Arduino.h>
#include "driver/twai.h"

#define CAN_TX_PIN GPIO_NUM_4
#define CAN_RX_PIN GPIO_NUM_5
#define TEST_ID    0x100

void setup() {
  Serial.begin(115200);
  delay(1000);
  Serial.println("\n--- CAN SELF-TEST (no external node needed) ---");

  twai_general_config_t g_config = TWAI_GENERAL_CONFIG_DEFAULT(CAN_TX_PIN, CAN_RX_PIN, TWAI_MODE_NO_ACK);
  twai_timing_config_t t_config = TWAI_TIMING_CONFIG_125KBITS();
  twai_filter_config_t f_config = TWAI_FILTER_CONFIG_ACCEPT_ALL();

  if (twai_driver_install(&g_config, &t_config, &f_config) != ESP_OK) {
    Serial.println("Driver install failed!");
    return;
  }
  if (twai_start() != ESP_OK) {
    Serial.println("Start failed!");
    return;
  }
  Serial.println("TWAI self-test mode up (125 kbps, NO_ACK).");
}

void loop() {
  static uint32_t counter = 0;
  static int pass = 0, fail = 0;

  twai_message_t tx_msg = {};
  tx_msg.identifier = TEST_ID;
  tx_msg.data_length_code = 8;
  tx_msg.flags = TWAI_MSG_FLAG_SELF; // request self-reception
  tx_msg.data[0] = (uint8_t)(counter & 0xFF);
  tx_msg.data[1] = (uint8_t)((counter >> 8) & 0xFF);
  tx_msg.data[2] = (uint8_t)((counter >> 16) & 0xFF);
  tx_msg.data[3] = (uint8_t)((counter >> 24) & 0xFF);

  esp_err_t tx_result = twai_transmit(&tx_msg, pdMS_TO_TICKS(1000));

  twai_message_t rx_msg;
  esp_err_t rx_result = twai_receive(&rx_msg, pdMS_TO_TICKS(1000));

  bool ok = (tx_result == ESP_OK) && (rx_result == ESP_OK) &&
            (rx_msg.identifier == TEST_ID) &&
            (rx_msg.data[0] == tx_msg.data[0]) &&
            (rx_msg.data[1] == tx_msg.data[1]) &&
            (rx_msg.data[2] == tx_msg.data[2]) &&
            (rx_msg.data[3] == tx_msg.data[3]);

  if (ok) pass++; else fail++;

  Serial.printf("[SELFTEST #%lu] tx=%s rx=%s match=%s  (pass=%d fail=%d)\n",
    (unsigned long)counter,
    tx_result == ESP_OK ? "OK" : "FAIL",
    rx_result == ESP_OK ? "OK" : "FAIL",
    ok ? "YES" : "NO",
    pass, fail);

  twai_status_info_t status;
  if (twai_get_status_info(&status) == ESP_OK) {
    Serial.printf("  [STATUS] tx_err=%d rx_err=%d bus_err_count=%d arb_lost=%d\n",
      status.tx_error_counter, status.rx_error_counter, status.bus_error_count, status.arb_lost_count);
  }

  counter++;
  delay(1000);
}
