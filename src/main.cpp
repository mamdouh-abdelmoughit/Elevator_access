#include <Arduino.h>
#include <WiFi.h>
#include <PubSubClient.h>
#include <ArduinoHttpClient.h>
#include <ArduinoJson.h>
#include <vector>

// --- REQUIRED LIBRARIES ---
#include <WIEGAND.h>
#include <Adafruit_MCP23X17.h>
#include <Wire.h>

// --- Wi-Fi Credentials ---
const char* WIFI_SSID = "YOUR_WIFI_SSID";
const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";

// --- Backend and MQTT Configuration ---
const char* BACKEND_SERVER = "192.168.1.15"; // <--- UPDATE THIS to your PC IP
const int   BACKEND_PORT = 3000;
const char* MQTT_BROKER = "broker.hivemq.com";
const int   MQTT_PORT = 1883;

// --- This Specific Elevator's ID ---
const int THIS_ELEVATOR_ID = 1;

// --- Hardware Pins & Settings ---
#define NUM_READERS 8
#define NUM_RELAYS 14
#define ACCESS_GRANTED_DURATION 2000 // ms

// --- NEW: Sensor Pins (Simulated) ---
#define PIN_DOOR_SENSOR 13   // Touch to Ground to simulate Door Open
#define PIN_FAULT_SIGNAL 12  // Touch to Ground to simulate Fault

// ======================================================
//      GLOBAL OBJECTS AND DATA STRUCTURES
// ======================================================

WiFiClient wifiClient;
PubSubClient mqttClient(wifiClient);
HttpClient httpClient(wifiClient, BACKEND_SERVER, BACKEND_PORT);

Adafruit_MCP23X17 mcp;
std::vector<WIEGAND> readers;

// Access Control Data
struct PermissionRule {
  unsigned long card_code;
  int relay_to_activate;
};
std::vector<PermissionRule> permissions;

struct RelayTimer {
  int relay_number;
  unsigned long turn_off_time;
};
std::vector<RelayTimer> active_relays;

// --- NEW: Sensor State Variables ---
int lastDoorState = HIGH;
int lastFaultState = HIGH;
unsigned long lastDebounceTime = 0;


// ======================================================
//      FUNCTION PROTOTYPES
// ======================================================
void setupWifi();
void connectToMqtt();
void fetchPermissions();
void mqttCallback(char* topic, byte* payload, unsigned int length);
void setupReaders();
void setupRelays();
void checkWiegandReaders();
void checkRelayTimers();
void checkSensors(); // <--- NEW
void publishStatus(String status, String code); // <--- NEW
void grantAccess(unsigned long card_code, int reader_id);
void publishAccessEvent(unsigned long card_code, int reader_id, bool granted);


// ======================================================
//      MAIN SETUP & LOOP
// ======================================================
void setup() {
  Serial.begin(115200);
  while (!Serial);
  Serial.println("\n--- Elevator Access Control System Booting Up ---");

  // 1. Setup Sensors (INPUT_PULLUP means HIGH when disconnected, LOW when grounded)
  pinMode(PIN_DOOR_SENSOR, INPUT_PULLUP);
  pinMode(PIN_FAULT_SIGNAL, INPUT_PULLUP);

  setupRelays();
  setupReaders();
  setupWifi();
  connectToMqtt();
  fetchPermissions(); 

  Serial.println("\n--- System Ready ---");
}

void loop() {
  if (!mqttClient.connected()) {
    connectToMqtt();
  }
  mqttClient.loop(); 

  // 1. Check Access Control (Cards)
  checkWiegandReaders();
  
  // 2. Check Relays (Timers)
  checkRelayTimers();

  // 3. Check Real-Time Sensors (Doors/Faults) <--- NEW
  checkSensors();
}


// ======================================================
//      SENSOR & STATUS LOGIC (NEW)
// ======================================================

void checkSensors() {
  // Simple Debounce to prevent flickering updates
  if (millis() - lastDebounceTime < 200) return;

  int currentDoorState = digitalRead(PIN_DOOR_SENSOR);
  int currentFaultState = digitalRead(PIN_FAULT_SIGNAL);

  // --- Check Door Change ---
  if (currentDoorState != lastDoorState) {
    lastDebounceTime = millis();
    lastDoorState = currentDoorState;
    
    if (currentDoorState == LOW) {
      Serial.println("Sensor Event: Door OPENING");
      publishStatus("DOOR_OPEN", "00");
    } else {
      Serial.println("Sensor Event: Door CLOSED");
      publishStatus("DOOR_CLOSED", "00");
    }
  }

  // --- Check Fault Change ---
  if (currentFaultState != lastFaultState) {
    lastDebounceTime = millis();
    lastFaultState = currentFaultState;
    
    if (currentFaultState == LOW) {
      Serial.println("Sensor Event: FAULT DETECTED (H1)");
      publishStatus("FAULT", "H1"); // Sending "H1" code
    } else {
      Serial.println("Sensor Event: FAULT CLEARED");
      publishStatus("IDLE", "OK");
    }
  }
}

void publishStatus(String status, String code) {
  if (!mqttClient.connected()) return;

  String topic = "elevators/" + String(THIS_ELEVATOR_ID) + "/status";
  
  // Create JSON: { "status": "DOOR_OPEN", "code": "00" }
  JsonDocument doc;
  doc["status"] = status;
  doc["code"] = code;
  
  String msg;
  serializeJson(doc, msg);
  
  mqttClient.publish(topic.c_str(), msg.c_str());
}


// ======================================================
//      NETWORKING FUNCTIONS (EXISTING)
// ======================================================

void setupWifi() {
  Serial.print("Connecting to Wi-Fi: ");
  Serial.println(WIFI_SSID);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("\nWiFi connected!");
  Serial.print("IP Address: ");
  Serial.println(WiFi.localIP());
}

void connectToMqtt() {
  mqttClient.setServer(MQTT_BROKER, MQTT_PORT);
  mqttClient.setCallback(mqttCallback);
  while (!mqttClient.connected()) {
    Serial.print("Attempting MQTT connection...");
    String clientId = "esp32-elevator-" + String(THIS_ELEVATOR_ID);
    if (mqttClient.connect(clientId.c_str())) {
      Serial.println("connected!");
      
      // Subscribe to Command Topic
      String commandTopic = "elevators/" + String(THIS_ELEVATOR_ID) + "/commands";
      mqttClient.subscribe(commandTopic.c_str());
      Serial.println("Subscribed to: " + commandTopic);

    } else {
      Serial.print("failed, rc=");
      Serial.print(mqttClient.state());
      Serial.println(" try again in 5s");
      delay(5000);
    }
  }
}

void fetchPermissions() {
  Serial.println("\nFetching permissions from backend...");
  String apiPath = "/permissions/elevator/" + String(THIS_ELEVATOR_ID);
  httpClient.get(apiPath);

  int statusCode = httpClient.responseStatusCode();
  String response = httpClient.responseBody();

  if (statusCode == 200) {
    JsonDocument doc;
    DeserializationError error = deserializeJson(doc, response);
    if (!error) {
      permissions.clear(); // Clear old permissions
      for (JsonObject rule : doc.as<JsonArray>()) {
        unsigned long code = strtoul(rule["card"]["code"], NULL, 10);
        int relay = rule["relay"];
        if (code > 0) {
          permissions.push_back({code, relay});
        }
      }
      Serial.printf("Loaded %d permissions.\n", permissions.size());
    }
  } else {
    Serial.printf("Fetch failed (HTTP %d)\n", statusCode);
  }
}

void mqttCallback(char* topic, byte* payload, unsigned int length) {
  payload[length] = '\0'; 
  String message = (char*)payload;
  Serial.printf("MQTT Msg: %s\n", message.c_str());

  StaticJsonDocument<256> doc;
  deserializeJson(doc, message);
  const char* command = doc["command"];

  if (command && strcmp(command, "UPDATE_PERMISSIONS") == 0) {
    fetchPermissions();
  } 
  else if (command && strcmp(command, "REMOTE_UNLOCK") == 0) {
    int relay = doc["relay"] | -1;
    if (relay >= 0 && relay < NUM_RELAYS) {
      mcp.digitalWrite(relay, LOW);
      active_relays.push_back({relay, millis() + ACCESS_GRANTED_DURATION});
    }
  }
  // Note: We don't strictly need ACCESS_RESPONSE logic here if the local check works, 
  // but we keep it compatible with your existing setup.
}


void publishAccessEvent(unsigned long card_code, int reader_id, bool granted) {
    if (!mqttClient.connected()) return;
    
    String topic = "elevators/" + String(THIS_ELEVATOR_ID) + "/access_event";
    JsonDocument doc;
    doc["card_code"] = String(card_code);
    doc["reader_id"] = reader_id;
    doc["status"] = granted ? "GRANTED" : "DENIED";

    String message;
    serializeJson(doc, message);
    mqttClient.publish(topic.c_str(), message.c_str());
}

// ======================================================
//      HARDWARE & LOGIC FUNCTIONS (EXISTING)
// ======================================================

void setupReaders() {
  Serial.println("Initializing Wiegand readers...");
  const int wiegand_pins[NUM_READERS][2] = {
    {1, 2}, {3, 4}, {5, 6}, {7, 10},
    {11, 12}, {13, 14}, {15, 16}, {17, 18}
  };
  for (int i = 0; i < NUM_READERS; i++) {
    readers.emplace_back();
    readers[i].begin(wiegand_pins[i][0], wiegand_pins[i][1]);
  }
}

void setupRelays() {
  Serial.println("Initializing relay controller (MCP23017)...");
  Wire.begin();
  if (!mcp.begin_I2C()) {
    Serial.println("Error: MCP23017 not found. Check wiring.");
    while (1); 
  }
  for (int i = 0; i < NUM_RELAYS; i++) {
    mcp.pinMode(i, OUTPUT);
    mcp.digitalWrite(i, HIGH); 
  }
}

void checkWiegandReaders() {
  for (int i = 0; i < NUM_READERS; i++) {
    if (readers[i].available()) {
      unsigned long code = readers[i].getCode();
      Serial.printf("Card detected! Reader ID: %d, Card Code: %lu\n", i, code);
      grantAccess(code, i);
    }
  }
}

void grantAccess(unsigned long card_code, int reader_id) {
  bool accessGranted = false;
  for (const auto& rule : permissions) {
    if (rule.card_code == card_code) {
      Serial.printf("Access GRANTED. Relay %d.\n", rule.relay_to_activate);
      mcp.digitalWrite(rule.relay_to_activate, LOW);
      active_relays.push_back({rule.relay_to_activate, millis() + ACCESS_GRANTED_DURATION});
      accessGranted = true;
      break; 
    }
  }

  if (!accessGranted) {
    Serial.println("Access DENIED.");
  }
  publishAccessEvent(card_code, reader_id, accessGranted);
}

void checkRelayTimers() {
  if (active_relays.empty()) return;
  unsigned long current_time = millis();
  for (auto it = active_relays.begin(); it != active_relays.end(); ) {
    if (current_time >= it->turn_off_time) {
      Serial.printf("Relay %d OFF.\n", it->relay_number);
      mcp.digitalWrite(it->relay_number, HIGH);
      it = active_relays.erase(it);
    } else {
      ++it;
    }
  }
}