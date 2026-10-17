// ==========================================================================
//   BIOSWITCH — CABIN-READER MASTER (CAN bus + WiFi) — PRODUCTION
// ==========================================================================
// One RFID reader inside the cabin -> Arduino Nano (nano_cabin_bridge.cpp)
// -> CAN bus -> this ESP32-S3 in the machine room.
//
// A valid swipe UNLOCKS the car-call buttons the card is allowed to use
// (e.g. RDC, the resident's floor and the top floor) for unlockSeconds; the
// resident then presses the one they want. Every other button stays dead.
// Each floor button is wired through one relay (NO contact in series with the
// button's call line) — see docs/CABIN_RELAY_WIRING.md.
//
// The access decision is taken HERE, from the whitelist synced from the
// backend (and kept in flash), so the cabin keeps working without network.
// Every swipe is published over MQTT and logged by the backend.
//
// Also kept from the original master (src/main.cpp.bak):
//   - 16 elevator status inputs (one MCP23017) published live over MQTT
//   - 6 remote-control relays (doors, shutdown, revision mode)
//
// Tasks:
//   accessTask (prio 3) : CAN receive -> lookup -> floor relays. Never touches
//                         the network, so a slow HTTP/MQTT call can't delay a swipe.
//   loop()     (prio 1) : WiFi, backend sync, MQTT, status inputs, control relays.
// ==========================================================================

#include <Arduino.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <Wire.h>
#include <Adafruit_MCP23X17.h>
#include <Preferences.h>
#include <PubSubClient.h>
#include <ArduinoHttpClient.h>
#include <ArduinoJson.h>
#include <vector>
#include <algorithm>
#include "driver/twai.h"
#include "secrets.h" // WIFI_SSID, WIFI_PASSWORD, MQTT_USER, MQTT_PASS, DEVICE_API_KEY

// ==========================================
//      CONFIGURATION
// ==========================================
static const char* BACKEND_SERVER = "elevator-backend-664487901469.europe-west1.run.app";
static const int   BACKEND_PORT   = 443;
static const char* MQTT_BROKER    = "broker.hivemq.com"; // replace with your Mosquitto host for production
static const int   MQTT_PORT      = 1883;

// --- CAN (TWAI) — to the SN65HVD230 transceiver ---
#define CAN_TX_PIN   GPIO_NUM_4
#define CAN_RX_PIN   GPIO_NUM_5
#define CAN_CARD_ID  0x100   // must match nano_cabin_bridge.cpp

// --- Status inputs: one MCP23017 on I2C, 16 inputs, active LOW ---
#define I2C_SDA          11
#define I2C_SCL          12
#define MCP_STATUS_ADDR  0x20

// --- Relay modules are active-LOW (IN pulled low = coil ON) ---
#define RELAY_ON   LOW
#define RELAY_OFF  HIGH

// Floor-button wiring (docs/CABIN_RELAY_WIRING.md section 5):
//   false = FAIL-SECURE (default): button through the relay's NO contact.
//           Coil ON = button works. ESP off/rebooting = every button locked.
//   true  = FAIL-OPEN: button through the NC contact. Coil ON = button locked.
//           ESP off = every button works (no access control, but nobody stuck).
#define FLOOR_RELAYS_FAIL_OPEN false

// Status inputs are "active" when pulled LOW (dry contact / optocoupler to GND).
// Set bit N to 1 for an MCP input whose signal is active when the line is HIGH.
#define STATUS_INVERT_MASK 0x0000

// Car-call button relays, index = floor (0 = RDC). 17 relays -> RDC + 16 floors.
//   RDC          -> 8-channel board IN7 (GPIO 35)
//   floors 1..16 -> 16-channel board IN1..IN16
// No strapping (0,3,45,46), USB (19,20), UART0 (43,44) or CAN (4,5) pins.
// GPIO 35/36 are only free on modules WITHOUT octal PSRAM (not "N8R8"/"N16R8").
static const uint8_t FLOOR_RELAY_PINS[] = {
  35,                                // RDC
  1,  2,  6,  7,  8,                 // 1, 2, 3, 4, 5
  9, 10, 13, 14, 15,                 // 6, 7, 8, 9, 10
  16, 17, 18, 21, 38,                // 11, 12, 13, 14, 15
  36                                 // 16
};
static const int MAX_FLOORS = sizeof(FLOOR_RELAY_PINS) / sizeof(FLOOR_RELAY_PINS[0]);

// Remote-control relays (same commands as the original master).
#define RELAY_OPEN_DOOR   39
#define RELAY_CLOSE_DOOR  40
#define RELAY_SHUTDOWN    41
#define RELAY_REV_MODE    42
#define RELAY_REV_UP      47
#define RELAY_REV_DOWN    48
static const uint8_t CONTROL_RELAY_PINS[] = {
  RELAY_OPEN_DOOR, RELAY_CLOSE_DOOR, RELAY_SHUTDOWN, RELAY_REV_MODE, RELAY_REV_UP, RELAY_REV_DOWN
};

// --- Timings ---
#define DEFAULT_UNLOCK_SECONDS  10
#define DUPLICATE_SWIPE_MS      1500    // same card again within this = CAN retry, ignored
#define STATUS_SAMPLE_MS        50
#define STATUS_STABLE_MS        150     // input must be stable this long before publishing
#define HEARTBEAT_MS            30000   // backend shows "offline" after 90 s without one
#define MQTT_RETRY_MS           5000
#define BACKEND_RETRY_MS        30000
#define PERMISSIONS_RESYNC_MS   (15UL * 60 * 1000) // safety net if an MQTT update is lost
#define WIFI_RESTART_MS         60000
#define STATUS_BOARD_RETRY_MS   10000

// Status inputs on the MCP23017 (pin -> name). Order = order in the published
// string (alarms first). Names unchanged from the original master so the
// apps' status colouring keeps working.
struct StatusSignal { uint8_t pin; const char* name; };
static const StatusSignal STATUS_SIGNALS[] = {
  {11, "SEC_GENERALE"}, {12, "SEC_PORTE_OPEN"}, {15, "FAULT_GENERAL"},
  {9,  "LIMIT_HAUT"},   {10, "LIMIT_BAS"},      {4,  "INSPECTION"},
  {0,  "CMD_MONTEE"},   {1,  "CMD_DESCENTE"},   {2,  "CMD_GV"},   {3, "CMD_PV"},
  {5,  "ML1"},          {6,  "ML2"},            {7,  "IMP_ARRET"}, {8, "IMP_PV"},
  {13, "OBSTACLE"},     {14, "PORTE_PHYSIQUE_OPEN"},
};

// ==========================================
//      SHARED STATE (loop <-> accessTask)
// ==========================================
struct CardRule { uint32_t code; uint32_t floorMask; }; // same 8-byte layout as the older uint16 mask + 0 padding
static std::vector<CardRule> rules;       // sorted by code, guarded by rulesMutex
static SemaphoreHandle_t rulesMutex;

struct AccessEvent { uint32_t code; uint32_t at; uint32_t mask; uint8_t reader; bool granted; bool freeAccess; };
static QueueHandle_t eventQueue;          // accessTask -> loop (MQTT publish)

static volatile uint32_t unlockMs   = DEFAULT_UNLOCK_SECONDS * 1000UL;
static volatile bool     freeAccess = false;   // "accès libre": every button unlocked
static volatile int      floorCount = -1;      // highest floor of the building, -1 = unknown

// ==========================================
//      NETWORK OBJECTS (loop only)
// ==========================================
static Preferences       prefs;
static Adafruit_MCP23X17 mcpStatus;
static WiFiClientSecure  httpsClient;
static WiFiClient        mqttNet;
static PubSubClient      mqtt(mqttNet);
static HttpClient        http(httpsClient, BACKEND_SERVER, BACKEND_PORT);

static int      elevatorId       = -1;
static bool     needConfig       = true;
static bool     needPermissions  = true;
static uint32_t lastPermSyncAt   = 0;
static String   currentStatus    = "IDLE";
static bool     statusBoardOk    = false;

// ==========================================
//      HELPERS
// ==========================================
static uint32_t allFloorsMask() {
  int top = floorCount;
  int n = (top >= 0 && top < MAX_FLOORS) ? top + 1 : MAX_FLOORS;
  return (1u << n) - 1;
}

static String floorsJson(uint32_t mask) {
  String s = "[";
  bool first = true;
  for (int f = 0; f < MAX_FLOORS; f++) {
    if (!(mask & (1u << f))) continue;
    if (!first) s += ",";
    s += String(f);
    first = false;
  }
  return s + "]";
}

static String floorsText(uint32_t mask) {
  String s;
  for (int f = 0; f < MAX_FLOORS; f++) {
    if (!(mask & (1u << f))) continue;
    if (s.length()) s += ", ";
    s += (f == 0) ? String("RDC") : String(f);
  }
  return s.length() ? s : String("-");
}

static uint32_t lookupFloorMask(uint32_t code) {
  uint32_t mask = 0;
  if (xSemaphoreTake(rulesMutex, pdMS_TO_TICKS(50)) == pdTRUE) {
    auto it = std::lower_bound(rules.begin(), rules.end(), code,
                               [](const CardRule& r, uint32_t c) { return r.code < c; });
    if (it != rules.end() && it->code == code) mask = it->floorMask;
    xSemaphoreGive(rulesMutex);
  }
  return mask;
}

static size_t ruleCount() {
  size_t n = 0;
  if (xSemaphoreTake(rulesMutex, pdMS_TO_TICKS(50)) == pdTRUE) { n = rules.size(); xSemaphoreGive(rulesMutex); }
  return n;
}

// ==========================================
//      RELAYS
// ==========================================
// Relay level that makes a floor button usable / dead (see FLOOR_RELAYS_FAIL_OPEN).
#define FLOOR_UNLOCKED (FLOOR_RELAYS_FAIL_OPEN ? RELAY_OFF : RELAY_ON)
#define FLOOR_LOCKED   (FLOOR_RELAYS_FAIL_OPEN ? RELAY_ON  : RELAY_OFF)

static void setupRelays() {
  // Level first, then direction: no glitch at boot. Every button locked.
  for (uint8_t pin : FLOOR_RELAY_PINS)   { digitalWrite(pin, FLOOR_LOCKED); pinMode(pin, OUTPUT); }
  for (uint8_t pin : CONTROL_RELAY_PINS) { digitalWrite(pin, RELAY_OFF); pinMode(pin, OUTPUT); }
}

// Owned by accessTask.
static void applyFloorRelays(uint32_t mask) {
  for (int f = 0; f < MAX_FLOORS; f++) {
    digitalWrite(FLOOR_RELAY_PINS[f], (mask & (1u << f)) ? FLOOR_UNLOCKED : FLOOR_LOCKED);
  }
}

// ==========================================
//      CAN + ACCESS TASK
// ==========================================
static bool setupCan() {
  twai_general_config_t g_config = TWAI_GENERAL_CONFIG_DEFAULT(CAN_TX_PIN, CAN_RX_PIN, TWAI_MODE_NORMAL);
  g_config.rx_queue_len = 32; // swipes queue here if the task is ever busy
  twai_timing_config_t t_config = TWAI_TIMING_CONFIG_125KBITS();
  twai_filter_config_t f_config = TWAI_FILTER_CONFIG_ACCEPT_ALL();

  if (twai_driver_install(&g_config, &t_config, &f_config) != ESP_OK) {
    Serial.println("[CAN] driver install failed!");
    return false;
  }
  if (twai_start() != ESP_OK) {
    Serial.println("[CAN] start failed!");
    return false;
  }
  Serial.println("[CAN] bus up (125 kbps).");
  return true;
}

// Logs controller state changes and recovers from BUS_OFF, which the TWAI
// controller never leaves on its own.
static void canHealthCheck() {
  static uint32_t lastBusErr = 0, lastTxErr = 0, lastRxErr = 0, lastMissed = 0;
  static twai_state_t lastState = TWAI_STATE_STOPPED;
  static bool recovering = false;

  twai_status_info_t st;
  if (twai_get_status_info(&st) != ESP_OK) return;

  if (st.state == TWAI_STATE_BUS_OFF && !recovering) {
    Serial.println("[CAN] BUS_OFF -> initiating recovery");
    twai_initiate_recovery();
    recovering = true;
  } else if (st.state == TWAI_STATE_STOPPED && recovering) {
    Serial.println("[CAN] recovery complete -> restarting driver");
    twai_start();
    recovering = false;
  }

  if (st.state != lastState || st.bus_error_count != lastBusErr || st.tx_error_counter != lastTxErr ||
      st.rx_error_counter != lastRxErr || st.rx_missed_count != lastMissed) {
    const char* s = st.state == TWAI_STATE_RUNNING ? "RUNNING" : st.state == TWAI_STATE_BUS_OFF ? "BUS_OFF" :
                    st.state == TWAI_STATE_RECOVERING ? "RECOVERING" : "STOPPED";
    Serial.printf("[CAN] state=%s tx_err=%lu rx_err=%lu bus_err=%lu rx_missed=%lu\n", s,
                  (unsigned long)st.tx_error_counter, (unsigned long)st.rx_error_counter,
                  (unsigned long)st.bus_error_count, (unsigned long)st.rx_missed_count);
    lastState = st.state; lastBusErr = st.bus_error_count; lastTxErr = st.tx_error_counter;
    lastRxErr = st.rx_error_counter; lastMissed = st.rx_missed_count;
  }
}

static void accessTask(void*) {
  uint32_t unlockedMask = 0;         // buttons unlocked by recent swipes
  uint32_t lockAt = 0;
  uint32_t appliedMask = 0xFFFFFFFF; // force first apply
  uint32_t lastCode = 0, lastCodeAt = 0, lastHealthAt = 0;

  for (;;) {
    twai_message_t msg;
    esp_err_t rx = twai_receive(&msg, pdMS_TO_TICKS(20));
    uint32_t now = millis();

    if (rx == ESP_OK) {
      bool isCard = msg.identifier == CAN_CARD_ID && msg.data_length_code >= 4 &&
                    !(msg.flags & TWAI_MSG_FLAG_RTR);
      if (isCard) {
        uint32_t code = (uint32_t)msg.data[0] | ((uint32_t)msg.data[1] << 8) |
                        ((uint32_t)msg.data[2] << 16) | ((uint32_t)msg.data[3] << 24);
        uint8_t reader = msg.data_length_code >= 5 ? msg.data[4] : 1;

        if (code == lastCode && now - lastCodeAt < DUPLICATE_SWIPE_MS) {
          lastCodeAt = now; // retry burst from the MCP2515: same swipe
        } else {
          lastCode = code; lastCodeAt = now;
          uint32_t mask = lookupFloorMask(code) & allFloorsMask();
          bool granted = mask != 0;
          if (granted) {
            // Two residents entering together: union of their floors, timer restarts.
            unlockedMask |= mask;
            lockAt = now + unlockMs;
            Serial.printf("\n>>> [ACCESS] card %lu GRANTED -> floors %s unlocked %lus\n",
                          (unsigned long)code, floorsText(mask).c_str(), (unsigned long)(unlockMs / 1000));
          } else {
            Serial.printf("\n>>> [ACCESS] card %lu DENIED (unknown or blocked)\n", (unsigned long)code);
          }
          AccessEvent ev = { code, now, mask, reader, granted, freeAccess };
          if (xQueueSend(eventQueue, &ev, 0) != pdTRUE) Serial.println("[ACCESS] event queue full, swipe not logged");
        }
      }
    } else if (rx != ESP_ERR_TIMEOUT) {
      vTaskDelay(pdMS_TO_TICKS(100)); // driver not running: don't spin and starve loop()
    }

    if (unlockedMask && (int32_t)(now - lockAt) >= 0) {
      unlockedMask = 0;
      Serial.println("[ACCESS] unlock window closed");
    }

    uint32_t wanted = freeAccess ? allFloorsMask() : unlockedMask;
    if (wanted != appliedMask) {
      applyFloorRelays(wanted);
      appliedMask = wanted;
    }

    if (now - lastHealthAt >= 500) { lastHealthAt = now; canHealthCheck(); }
  }
}

// ==========================================
//      FLASH (offline backup)
// ==========================================
static void saveConfig() {
  prefs.begin("bsw_cabin", false);
  prefs.putInt("elev_id", elevatorId);
  prefs.putInt("floors", floorCount);
  prefs.putUInt("unlock_ms", unlockMs);
  prefs.putBool("free", freeAccess);
  prefs.end();
}

static void saveRules(const std::vector<CardRule>& r) {
  prefs.begin("bsw_cabin", false);
  prefs.putUInt("rules_n", r.size());
  if (r.empty()) prefs.remove("rules");
  else prefs.putBytes("rules", r.data(), r.size() * sizeof(CardRule));
  prefs.end();
}

static void loadOfflineBackup() {
  prefs.begin("bsw_cabin", true);
  elevatorId = prefs.getInt("elev_id", -1);
  floorCount = prefs.getInt("floors", -1);
  unlockMs   = prefs.getUInt("unlock_ms", DEFAULT_UNLOCK_SECONDS * 1000UL);
  freeAccess = prefs.getBool("free", false);
  uint32_t n = prefs.getUInt("rules_n", 0);
  std::vector<CardRule> loaded;
  if (n > 0 && prefs.getBytesLength("rules") == n * sizeof(CardRule)) {
    loaded.resize(n);
    prefs.getBytes("rules", loaded.data(), n * sizeof(CardRule));
  }
  prefs.end();

  xSemaphoreTake(rulesMutex, portMAX_DELAY);
  rules.swap(loaded);
  xSemaphoreGive(rulesMutex);
  Serial.printf("[FLASH] elevator=%d floors=%d unlock=%lus free=%d cards=%u\n",
                elevatorId, (int)floorCount, (unsigned long)(unlockMs / 1000), (int)freeAccess, (unsigned)rules.size());
}

// ==========================================
//      BACKEND (HTTPS)
// ==========================================
static int httpGet(const String& path, String& body) {
  http.beginRequest();
  if (http.get(path) != 0) { http.stop(); return -1; }
  if (strlen(DEVICE_API_KEY) > 0) http.sendHeader("x-device-key", DEVICE_API_KEY);
  http.endRequest();
  int status = http.responseStatusCode();
  body = status > 0 ? http.responseBody() : String();
  http.stop(); // fresh TLS session for the next call
  return status;
}

static bool fetchConfig() {
  String body;
  int status = httpGet("/elevators/identify?mac=" + WiFi.macAddress(), body);
  Serial.printf("[HTTP] identify (%s) -> %d\n", WiFi.macAddress().c_str(), status);
  if (status != 200) {
    if (status == 404) Serial.println("[HTTP] this MAC is not registered — add the elevator in the admin app");
    return false;
  }
  JsonDocument doc;
  if (deserializeJson(doc, body)) return false;
  int id = doc["id"] | -1;
  if (id < 0) return false;

  elevatorId = id;
  floorCount = doc["floorCount"].isNull() ? -1 : doc["floorCount"].as<int>();
  int seconds = doc["unlockSeconds"] | DEFAULT_UNLOCK_SECONDS;
  unlockMs = (uint32_t)constrain(seconds, 3, 60) * 1000UL;
  freeAccess = doc["freeAccess"] | false;
  saveConfig();
  Serial.printf("[HTTP] elevator #%d: floors=%d unlock=%ds freeAccess=%d\n", elevatorId, (int)floorCount, seconds, (int)freeAccess);
  return true;
}

static bool fetchPermissions() {
  String body;
  int status = httpGet("/permissions/elevator/" + String(elevatorId), body);
  Serial.printf("[HTTP] permissions -> %d\n", status);
  if (status != 200) return false;

  JsonDocument doc;
  DeserializationError err = deserializeJson(doc, body);
  if (err) { Serial.printf("[HTTP] permissions JSON error: %s\n", err.c_str()); return false; }

  // One row per (card, floor): OR the rows of each card into a floor bitmask.
  std::vector<CardRule> fresh;
  for (JsonObject row : doc.as<JsonArray>()) {
    const char* codeStr = row["card"]["code"];
    int floor = row["relay"] | -1;
    if (!codeStr || floor < 0 || floor >= MAX_FLOORS) continue;
    uint32_t code = strtoul(codeStr, nullptr, 10);
    if (code == 0) continue;
    fresh.push_back({ code, 1u << floor });
  }
  std::sort(fresh.begin(), fresh.end(), [](const CardRule& a, const CardRule& b) { return a.code < b.code; });
  std::vector<CardRule> merged;
  for (const CardRule& r : fresh) {
    if (!merged.empty() && merged.back().code == r.code) merged.back().floorMask |= r.floorMask;
    else merged.push_back(r);
  }

  bool changed;
  xSemaphoreTake(rulesMutex, portMAX_DELAY);
  changed = merged.size() != rules.size() ||
            !std::equal(merged.begin(), merged.end(), rules.begin(),
                        [](const CardRule& a, const CardRule& b) { return a.code == b.code && a.floorMask == b.floorMask; });
  if (changed) rules = merged;
  xSemaphoreGive(rulesMutex);

  if (changed) saveRules(merged);
  Serial.printf("[HTTP] whitelist: %u cards%s\n", (unsigned)merged.size(), changed ? " (updated, saved to flash)" : " (unchanged)");
  for (const CardRule& r : merged) Serial.printf("   card %lu -> %s\n", (unsigned long)r.code, floorsText(r.floorMask).c_str());
  return true;
}

static void maintainBackend() {
  static uint32_t lastFailAt = 0;
  static bool failed = false;
  if (WiFi.status() != WL_CONNECTED) return;

  if (millis() - lastPermSyncAt > PERMISSIONS_RESYNC_MS) needPermissions = true;
  if (!needConfig && !needPermissions) return;
  if (failed && millis() - lastFailAt < BACKEND_RETRY_MS) return;

  failed = false;
  if (needConfig) {
    if (fetchConfig()) needConfig = false;
    else { failed = true; lastFailAt = millis(); return; }
  }
  if (needPermissions && elevatorId > 0) {
    if (fetchPermissions()) { needPermissions = false; lastPermSyncAt = millis(); }
    else { failed = true; lastFailAt = millis(); }
  }
}

// ==========================================
//      MQTT
// ==========================================
static String topicFor(const char* leaf) { return "elevators/" + String(elevatorId) + "/" + leaf; }

static void publishStatus(const char* details) {
  if (!mqtt.connected()) return;
  JsonDocument doc;
  doc["status"] = currentStatus;
  doc["details"] = details;
  doc["free_access"] = (bool)freeAccess;
  doc["cards"] = ruleCount();
  doc["rssi"] = WiFi.RSSI();
  doc["uptime_s"] = millis() / 1000;
  String msg;
  serializeJson(doc, msg);
  mqtt.publish(topicFor("status").c_str(), msg.c_str());
}

static void handleRemoteControl(const char* action) {
  struct { const char* name; uint8_t pin; uint8_t level; } table[] = {
    {"OPEN_DOOR_ON", RELAY_OPEN_DOOR, RELAY_ON},     {"OPEN_DOOR_OFF", RELAY_OPEN_DOOR, RELAY_OFF},
    {"CLOSE_DOOR_ON", RELAY_CLOSE_DOOR, RELAY_ON},   {"CLOSE_DOOR_OFF", RELAY_CLOSE_DOOR, RELAY_OFF},
    {"SHUTDOWN_ON", RELAY_SHUTDOWN, RELAY_ON},       {"SHUTDOWN_OFF", RELAY_SHUTDOWN, RELAY_OFF},
    {"REVISION_MODE_ON", RELAY_REV_MODE, RELAY_ON},  {"REVISION_MODE_OFF", RELAY_REV_MODE, RELAY_OFF},
    {"REV_MONTEE_ON", RELAY_REV_UP, RELAY_ON},       {"REV_MONTEE_OFF", RELAY_REV_UP, RELAY_OFF},
    {"REV_DESCENTE_ON", RELAY_REV_DOWN, RELAY_ON},   {"REV_DESCENTE_OFF", RELAY_REV_DOWN, RELAY_OFF},
  };
  for (auto& c : table) {
    if (strcmp(action, c.name) == 0) {
      digitalWrite(c.pin, c.level);
      Serial.printf(">> CMD: %s\n", action);
      return;
    }
  }
  if (strcmp(action, "FREE_ACCESS_ON") == 0 || strcmp(action, "FREE_ACCESS_OFF") == 0) {
    freeAccess = strcmp(action, "FREE_ACCESS_ON") == 0;
    saveConfig();
    Serial.printf(">> CMD: free access %s\n", freeAccess ? "ON (all floors unlocked)" : "OFF");
    publishStatus("FULL_UPDATE");
    return;
  }
  Serial.printf(">> CMD: unknown action '%s'\n", action);
}

static void onMqttMessage(char* topic, byte* payload, unsigned int length) {
  JsonDocument doc;
  if (deserializeJson(doc, payload, length)) return; // no in-place NUL write past the buffer
  const char* command = doc["command"] | "";
  if (strcmp(command, "UPDATE_PERMISSIONS") == 0) needPermissions = true;
  else if (strcmp(command, "UPDATE_CONFIG") == 0) { needConfig = true; needPermissions = true; }
  else if (strcmp(command, "REMOTE_CONTROL") == 0) handleRemoteControl(doc["action"] | "");
}

static void maintainMqtt() {
  static uint32_t lastTryAt = 0;
  if (WiFi.status() != WL_CONNECTED || elevatorId < 0) return;
  if (mqtt.connected()) { mqtt.loop(); return; }
  if (lastTryAt && millis() - lastTryAt < MQTT_RETRY_MS) return;
  lastTryAt = millis();

  String mac = WiFi.macAddress();
  mac.replace(":", "");
  String clientId = "bioswitch-cabin-" + mac;
  String willTopic = topicFor("status");
  // If the link drops, the broker publishes this for us -> apps show "offline" at once.
  const char* will = "{\"status\":\"OFFLINE\",\"details\":\"LWT\"}";
  bool ok = mqtt.connect(clientId.c_str(),
                         strlen(MQTT_USER) ? MQTT_USER : nullptr,
                         strlen(MQTT_USER) ? MQTT_PASS : nullptr,
                         willTopic.c_str(), 1, false, will);
  if (!ok) { Serial.printf("[MQTT] connect failed (state %d)\n", mqtt.state()); return; }

  Serial.println("[MQTT] connected");
  mqtt.subscribe(topicFor("commands").c_str());
  publishStatus("FULL_UPDATE");
  needPermissions = true; // an update may have been missed while disconnected
}

// Swipes are queued by accessTask and published here; kept in the queue
// (up to 32) while MQTT is down, with their age so the backend dates them right.
static void publishAccessEvents() {
  if (!mqtt.connected()) return;
  AccessEvent ev;
  while (xQueuePeek(eventQueue, &ev, 0) == pdTRUE) {
    String msg = "{\"card_code\":\"" + String((unsigned long)ev.code) + "\"" +
                 ",\"status\":\"" + (ev.granted ? "GRANTED" : "DENIED") + "\"" +
                 ",\"floors\":" + floorsJson(ev.mask) +
                 ",\"reader_id\":" + String(ev.reader) +
                 ",\"free_access\":" + (ev.freeAccess ? "true" : "false") +
                 ",\"ago_ms\":" + String((unsigned long)(millis() - ev.at)) + "}";
    if (!mqtt.publish(topicFor("access_event").c_str(), msg.c_str())) break;
    xQueueReceive(eventQueue, &ev, 0);
  }
}

// ==========================================
//      ELEVATOR STATUS INPUTS
// ==========================================
static bool setupStatusBoard() {
  if (!mcpStatus.begin_I2C(MCP_STATUS_ADDR)) return false;
  for (int i = 0; i < 16; i++) mcpStatus.pinMode(i, INPUT_PULLUP);
  return true;
}

static String buildStatusString(uint16_t activeBits) {
  String s;
  for (const StatusSignal& sig : STATUS_SIGNALS) {
    if (!(activeBits & (1u << sig.pin))) continue;
    if (s.length()) s += " + ";
    s += sig.name;
  }
  return s.length() ? s : String("IDLE");
}

static void pollStatusInputs() {
  static uint32_t lastSampleAt = 0, lastRetryAt = 0, candidateSince = 0;
  static uint16_t candidate = 0, published = 0xFFFF;
  uint32_t now = millis();

  if (!statusBoardOk) {
    if (now - lastRetryAt < STATUS_BOARD_RETRY_MS && lastRetryAt) return;
    lastRetryAt = now;
    statusBoardOk = setupStatusBoard();
    if (!statusBoardOk) {
      if (currentStatus != "STATUS_BOARD_MISSING") {
        Serial.println("[STATUS] MCP23017 (0x20) not found — check I2C wiring");
        currentStatus = "STATUS_BOARD_MISSING";
        publishStatus("FULL_UPDATE");
      }
      return;
    }
    Serial.println("[STATUS] MCP23017 status board ready");
    published = 0xFFFF; // force a publish
  }

  if (now - lastSampleAt < STATUS_SAMPLE_MS) return;
  lastSampleAt = now;

  uint16_t active = ~mcpStatus.readGPIOAB() ^ STATUS_INVERT_MASK; // active LOW unless inverted
  if (active != candidate) { candidate = active; candidateSince = now; return; }
  if (candidate == published || now - candidateSince < STATUS_STABLE_MS) return;

  published = candidate;
  currentStatus = buildStatusString(candidate);
  Serial.printf("[STATE] %s\n", currentStatus.c_str());
  publishStatus("FULL_UPDATE");
}

// ==========================================
//      WIFI
// ==========================================
static void maintainWifi() {
  static uint32_t lostAt = 0;
  static bool wasConnected = false;
  if (WiFi.status() == WL_CONNECTED) {
    if (!wasConnected) {
      Serial.printf("[WIFI] connected, IP %s, RSSI %d dBm\n", WiFi.localIP().toString().c_str(), WiFi.RSSI());
      wasConnected = true;
    }
    lostAt = 0;
    return;
  }
  if (wasConnected) { Serial.println("[WIFI] connection lost — cabin keeps working offline"); wasConnected = false; }
  if (!lostAt) lostAt = millis();
  if (millis() - lostAt > WIFI_RESTART_MS) {
    Serial.println("[WIFI] restarting connection");
    WiFi.disconnect();
    WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
    lostAt = millis();
  }
}

// ==========================================
//      SETUP / LOOP
// ==========================================
void setup() {
  setupRelays(); // first thing: every button locked, control relays off
  Serial.begin(115200);
  delay(300);
  Serial.println("\n--- BIOSWITCH: CABIN MASTER (CAN + WiFi) ---");

  rulesMutex = xSemaphoreCreateMutex();
  eventQueue = xQueueCreate(32, sizeof(AccessEvent));
  loadOfflineBackup(); // the cabin works from the flash whitelist until the backend answers

  Wire.begin(I2C_SDA, I2C_SCL);
  statusBoardOk = setupStatusBoard();
  Serial.println(statusBoardOk ? "[STATUS] MCP23017 status board ready" : "[STATUS] MCP23017 (0x20) not found");

  setupCan();
  xTaskCreatePinnedToCore(accessTask, "access", 4096, nullptr, 3, nullptr, 1);

  httpsClient.setInsecure(); // Cloud Run rotates certificates; no pinning
  http.setHttpResponseTimeout(10000);
  mqtt.setServer(MQTT_BROKER, MQTT_PORT);
  mqtt.setCallback(onMqttMessage);
  mqtt.setBufferSize(1024);
  mqtt.setKeepAlive(30);
  mqtt.setSocketTimeout(5);

  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(true);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  Serial.printf("[WIFI] connecting to %s (MAC %s)\n", WIFI_SSID, WiFi.macAddress().c_str());
}

void loop() {
  static uint32_t lastHeartbeatAt = 0;

  maintainWifi();
  maintainBackend();
  maintainMqtt();
  publishAccessEvents();
  pollStatusInputs();

  if (mqtt.connected() && millis() - lastHeartbeatAt >= HEARTBEAT_MS) {
    lastHeartbeatAt = millis();
    publishStatus("HEARTBEAT");
  }
  delay(1);
}
