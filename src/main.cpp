#include <Arduino.h>
#include <WiFi.h>
#include <PubSubClient.h>
#include <ArduinoHttpClient.h>
#include <ArduinoJson.h>
#include <vector>

// --- REQUIRED LIBRARIES (from platformio.ini) ---
#include <WIEGAND.h> // Using your specified uppercase WIEGAND.h
#include <Adafruit_MCP23X17.h> // Using the library you specified
#include <Wire.h>


// --- Wi-Fi Credentials ---
const char* WIFI_SSID = "YOUR_WIFI_SSID";
const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";

// --- Backend and MQTT Configuration ---
const char* BACKEND_SERVER = "192.168.x.x"; // Your computer's IP address
const int   BACKEND_PORT = 3000;
const char* MQTT_BROKER = "broker.hivemq.com";
const int   MQTT_PORT = 1883; // Standard MQTT port

// --- This Specific Elevator's ID ---
// This ID must match the 'id' of the elevator in your database
const int THIS_ELEVATOR_ID = 1;

// --- Hardware Pins & Settings ---
#define NUM_READERS 8
#define NUM_RELAYS 14
#define ACCESS_GRANTED_DURATION 2000 // ms

// ======================================================
//      GLOBAL OBJECTS AND DATA STRUCTURES
// ======================================================

// Networking
WiFiClient wifiClient;
PubSubClient mqttClient(wifiClient);
HttpClient httpClient(wifiClient, BACKEND_SERVER, BACKEND_PORT);

// Hardware
Adafruit_MCP23X17 mcp; // Class name for I2C version is MCP23017
std::vector<WIEGAND> readers;

// Data Structures
struct PermissionRule {
  unsigned long card_code;
  int relay_to_activate;
};
std::vector<PermissionRule> permissions; // This will be loaded from the backend

struct RelayTimer {
  int relay_number;
  unsigned long turn_off_time;
};
std::vector<RelayTimer> active_relays;


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
void grantAccess(unsigned long card_code, int reader_id);
void publishAccessEvent(unsigned long card_code, int reader_id, bool granted);

// ======================================================
//      MAIN SETUP & LOOP
// ======================================================
void setup() {
  Serial.begin(115200);
  while (!Serial);
  Serial.println("\n--- Elevator Access Control System Booting Up ---");

  setupRelays();
  setupReaders();

  // Connect to network and fetch initial data
  setupWifi();
  connectToMqtt();
  fetchPermissions(); // This replaces your hardcoded mock permissions

  Serial.println("\n--- System Ready ---");
}

void loop() {
  // Always maintain the MQTT connection
  if (!mqttClient.connected()) {
    connectToMqtt();
  }
  mqttClient.loop(); // This processes incoming MQTT messages

  // Perform local hardware tasks
  checkWiegandReaders();
  checkRelayTimers();
}

// ======================================================
//      NETWORKING FUNCTIONS
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
      // Subscribe to the command topic for this specific elevator
      String commandTopic = "elevators/" + String(THIS_ELEVATOR_ID) + "/commands";
      mqttClient.subscribe(commandTopic.c_str());
      Serial.print("Subscribed to command topic: ");
      Serial.println(commandTopic);
    } else {
      Serial.print("failed, rc=");
      Serial.print(mqttClient.state());
      Serial.println(" try again in 5 seconds");
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

  Serial.printf("HTTP Status: %d\n", statusCode);
  if (statusCode == 200) {
    Serial.println("Response received, parsing permissions...");
    JsonDocument doc;
    DeserializationError error = deserializeJson(doc, response);
    if (error) {
      Serial.printf("deserializeJson() failed: %s\n", error.c_str());
      return;
    }
    permissions.clear(); // Clear old permissions before loading new ones
    for (JsonObject rule : doc.as<JsonArray>()) {
      // The path is permission -> card -> code
      unsigned long code = strtoul(rule["card"]["code"], NULL, 10);
      int relay = rule["relay"];
      if (code > 0) {
        permissions.push_back({code, relay});
      }
    }
    Serial.printf("Successfully loaded %d permission rules from backend.\n", permissions.size());
  } else {
    Serial.println("Failed to fetch permissions. System will operate with no permissions.");
    permissions.clear(); // Ensure no old permissions are left
  }
}

void mqttCallback(char* topic, byte* payload, unsigned int length) {
  Serial.printf("Message arrived on topic: %s\n", topic);
  payload[length] = '\0'; // Null-terminate the payload to make it a valid C-string
  String message = (char*)payload;
  Serial.printf("Payload: %s\n", message.c_str());

  StaticJsonDocument<256> doc;
  DeserializationError err = deserializeJson(doc, message);
  if (err) {
    Serial.print(F("deserializeJson() failed: "));
    Serial.println(err.c_str());
    return;
  }

  const char* command = doc["command"];
  if (!command) {
    Serial.println("No command field in MQTT message.");
    return;
  }

  if (strcmp(command, "UPDATE_PERMISSIONS") == 0) {
    Serial.println("Received command to update permissions. Fetching now...");
    fetchPermissions();
  } else if (strcmp(command, "REMOTE_UNLOCK") == 0) {
    int relayToActivate = doc["relay"] | -1;
    Serial.printf("Received remote unlock command for relay %d.\n", relayToActivate);
    if (relayToActivate >= 0 && relayToActivate < NUM_RELAYS) {
      mcp.digitalWrite(relayToActivate, LOW);
      active_relays.push_back({relayToActivate, millis() + ACCESS_GRANTED_DURATION});
    }
  } else if (strcmp(command, "ACCESS_RESPONSE") == 0) {
    const char* card = doc["card_code"];
    const char* status = doc["status"];
    int relay = doc["relay"] | -1;
    Serial.printf("ACCESS_RESPONSE for %s: %s relay: %d\n", card ? card : "?", status ? status : "?", relay);
    if (relay >= 0 && strcmp(status, "GRANTED") == 0) {
      if (relay >= 0 && relay < NUM_RELAYS) {
        mcp.digitalWrite(relay, LOW);
        active_relays.push_back({relay, millis() + ACCESS_GRANTED_DURATION});
      }
    }
  } else {
    Serial.printf("Unknown command: %s\n", command);
  }
}


void publishAccessEvent(unsigned long card_code, int reader_id, bool granted) {
    if (!mqttClient.connected()) {
        return; // Don't try to publish if not connected
    }
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
//      HARDWARE & LOGIC FUNCTIONS
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
    while (1); // Halt if we can't communicate with the relay controller
  }
  for (int i = 0; i < NUM_RELAYS; i++) {
    mcp.pinMode(i, OUTPUT);
    mcp.digitalWrite(i, HIGH); // Assuming relays are active-low
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
  // This logic now checks against the permissions downloaded from the backend
  for (const auto& rule : permissions) {
    if (rule.card_code == card_code) {
      Serial.printf("Access GRANTED. Activating relay %d.\n", rule.relay_to_activate);
      mcp.digitalWrite(rule.relay_to_activate, LOW);
      active_relays.push_back({rule.relay_to_activate, millis() + ACCESS_GRANTED_DURATION});
      accessGranted = true;
      break; // Stop after finding the first matching rule
    }
  }

  if (!accessGranted) {
    Serial.println("Access DENIED.");
  }

  // Publish the event to the backend for logging, regardless of outcome
  publishAccessEvent(card_code, reader_id, accessGranted);
}

void checkRelayTimers() {
  if (active_relays.empty()) return;
  unsigned long current_time = millis();
  for (auto it = active_relays.begin(); it != active_relays.end(); ) {
    if (current_time >= it->turn_off_time) {
      Serial.printf("Timer expired. Turning off relay %d.\n", it->relay_number);
      mcp.digitalWrite(it->relay_number, HIGH);
      it = active_relays.erase(it);
    } else {
      ++it;
    }
  }
}