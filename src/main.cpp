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

// ==========================================
//      USER CONFIGURATION (EDIT THIS)
// ==========================================
const char* WIFI_SSID     = "YOUR_WIFI_SSID";      // <--- CHANGE ME
const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";  // <--- CHANGE ME
const char* BACKEND_SERVER = "192.168.1.15";       // <--- CHANGE TO YOUR PC IP
const int   BACKEND_PORT   = 3000;
const char* MQTT_BROKER    = "broker.hivemq.com";
const int   MQTT_PORT      = 1883;

// ==========================================
//      SYSTEM VARIABLES
// ==========================================
int THIS_ELEVATOR_ID = -1; // Will be fetched automatically via MAC
String DEVICE_MAC = "";

// --- Hardware Pins ---
#define PIN_DOOR_SENSOR 13   // Input: Door Sensor (GND = Open)
#define PIN_FAULT_SIGNAL 12  // Input: Fault Signal (GND = Fault H1)

// --- Settings ---
#define NUM_READERS 8
#define NUM_RELAYS 14
#define ACCESS_GRANTED_DURATION 2000 // 2 seconds unlock time

// ==========================================
//      OBJECTS & DATA
// ==========================================
WiFiClient wifiClient;
PubSubClient mqttClient(wifiClient);
HttpClient httpClient(wifiClient, BACKEND_SERVER, BACKEND_PORT);

Adafruit_MCP23X17 mcp; // I2C Relay Controller
std::vector<WIEGAND> readers;

// Permissions Cache
struct PermissionRule {
  unsigned long card_code;
  int relay_to_activate;
};
std::vector<PermissionRule> permissions;

// Active Relay Timers (for auto-off)
struct RelayTimer {
  int relay_number;
  unsigned long turn_off_time;
};
std::vector<RelayTimer> active_relays;

// Sensor Debouncing
int lastDoorState = HIGH;
int lastFaultState = HIGH;
unsigned long lastDebounceTime = 0;


// ==========================================
//      FUNCTION PROTOTYPES
// ==========================================
void setupWifi();
bool getElevatorConfig(); // The Magic Function
void connectToMqtt();
void fetchPermissions();
void mqttCallback(char* topic, byte* payload, unsigned int length);
void setupReaders();
void setupRelays();
void checkWiegandReaders();
void checkRelayTimers();
void checkSensors();
void publishStatus(String status, String code);
void grantAccess(unsigned long card_code, int reader_id);
void publishAccessEvent(unsigned long card_code, int reader_id, bool granted);


// ==========================================
//      MAIN SETUP
// ==========================================
void setup() {
  Serial.begin(115200);
  delay(1000);
  Serial.println("\n\n--- Elevator Access Control System Booting Up ---");

  // 1. Setup Input Sensors
  pinMode(PIN_DOOR_SENSOR, INPUT_PULLUP);
  pinMode(PIN_FAULT_SIGNAL, INPUT_PULLUP);

  // 2. Setup Hardware
  setupRelays();
  setupReaders();

  // 3. Connect to WiFi
  setupWifi();

  // 4. AUTO-DISCOVERY: Loop until backend assigns an ID
  while (!getElevatorConfig()) {
    Serial.println("... Waiting for registration. Add this MAC in the App now.");
    delay(5000); // Retry every 5 seconds
  }

  // 5. Connect to Services
  connectToMqtt();
  fetchPermissions(); 

  Serial.println("\n--- System Ready & Online ---");
}


// ==========================================
//      MAIN LOOP
// ==========================================
void loop() {
  // Ensure MQTT stays connected
  if (!mqttClient.connected()) {
    connectToMqtt();
  }
  mqttClient.loop(); 

  // 1. Hardware Tasks
  checkWiegandReaders();
  checkRelayTimers();
  checkSensors(); // Real-time status updates
}


// ==========================================
//      AUTO-DISCOVERY LOGIC
// ==========================================
bool getElevatorConfig() {
  DEVICE_MAC = WiFi.macAddress();
  Serial.print("My Device MAC Address: ");
  Serial.println(DEVICE_MAC);

  Serial.println("Contacting Backend for ID...");
  
  // Call API: GET /elevators/identify?mac=XX:XX:XX...
  String apiPath = "/elevators/identify?mac=" + DEVICE_MAC; 
  
  httpClient.get(apiPath);
  int statusCode = httpClient.responseStatusCode();
  String response = httpClient.responseBody();

  if (statusCode == 200) {
    JsonDocument doc;
    DeserializationError err = deserializeJson(doc, response);
    if (!err) {
      THIS_ELEVATOR_ID = doc["id"];
      String name = doc["name"];
      Serial.printf(">> SUCCESS! Registered as Elevator ID: %d (%s)\n", THIS_ELEVATOR_ID, name.c_str());
      return true;
    }
  } 
  
  Serial.printf(">> Not Registered yet (HTTP %d). \n", statusCode);
  return false;
}


// ==========================================
//      NETWORKING
// ==========================================
void setupWifi() {
  Serial.print("Connecting to Wi-Fi: ");
  Serial.println(WIFI_SSID);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("\nWiFi Connected!");
  Serial.print("Local IP: ");
  Serial.println(WiFi.localIP());
}

void connectToMqtt() {
  if (THIS_ELEVATOR_ID == -1) return; // Don't connect if we don't know who we are

  mqttClient.setServer(MQTT_BROKER, MQTT_PORT);
  mqttClient.setCallback(mqttCallback);

  while (!mqttClient.connected()) {
    Serial.print("Connecting to MQTT Broker...");
    String clientId = "esp32-elevator-" + String(THIS_ELEVATOR_ID) + "-" + String(random(1000));
    
    if (mqttClient.connect(clientId.c_str())) {
      Serial.println(" Connected!");
      
      // Subscribe to Commands
      String commandTopic = "elevators/" + String(THIS_ELEVATOR_ID) + "/commands";
      mqttClient.subscribe(commandTopic.c_str());
      Serial.println("Listening on: " + commandTopic);
    } else {
      Serial.print(" Failed (rc=");
      Serial.print(mqttClient.state());
      Serial.println(") Retrying in 5s...");
      delay(5000);
    }
  }
}

void fetchPermissions() {
  Serial.println("Syncing Permissions...");
  String apiPath = "/permissions/elevator/" + String(THIS_ELEVATOR_ID);
  httpClient.get(apiPath);

  if (httpClient.responseStatusCode() == 200) {
    JsonDocument doc;
    deserializeJson(doc, httpClient.responseBody());
    
    permissions.clear();
    for (JsonObject rule : doc.as<JsonArray>()) {
      unsigned long code = strtoul(rule["card"]["code"], NULL, 10);
      int relay = rule["relay"];
      if (code > 0) permissions.push_back({code, relay});
    }
    Serial.printf("Permissions Loaded: %d rules active.\n", permissions.size());
  } else {
    Serial.println("Failed to sync permissions.");
  }
}

void mqttCallback(char* topic, byte* payload, unsigned int length) {
  payload[length] = '\0'; 
  String message = (char*)payload;
  Serial.printf("MQTT CMD: %s\n", message.c_str());

  StaticJsonDocument<256> doc;
  deserializeJson(doc, message);
  const char* command = doc["command"];

  if (!command) return;

  // 1. UPDATE PERMISSIONS
  if (strcmp(command, "UPDATE_PERMISSIONS") == 0) {
    fetchPermissions();
  } 
  // 2. REMOTE CONTROL (From App)
  else if (strcmp(command, "REMOTE_CONTROL") == 0) {
    const char* action = doc["action"];
    Serial.printf("Remote Action: %s\n", action);

    if (strcmp(action, "OPEN_DOOR") == 0) {
      Serial.println(">> RELAY 1 (OPEN)");
      mcp.digitalWrite(1, LOW); 
      active_relays.push_back({1, millis() + 2000}); 
    }
    else if (strcmp(action, "CLOSE_DOOR") == 0) {
      Serial.println(">> RELAY 2 (CLOSE)");
      mcp.digitalWrite(2, LOW);
      active_relays.push_back({2, millis() + 2000}); 
    }
    else if (strcmp(action, "SHUTDOWN") == 0) {
      Serial.println(">> RELAY 3 (SHUTDOWN/HOLD)");
      mcp.digitalWrite(3, LOW); 
      // Stays LOW until restart command
    }
    else if (strcmp(action, "START") == 0) {
      Serial.println(">> RELAY 3 (RELEASE)");
      mcp.digitalWrite(3, HIGH); 
    }
  }
}

void publishStatus(String status, String code) {
  if (!mqttClient.connected()) return;
  String topic = "elevators/" + String(THIS_ELEVATOR_ID) + "/status";
  JsonDocument doc;
  doc["status"] = status;
  doc["code"] = code;
  String msg;
  serializeJson(doc, msg);
  mqttClient.publish(topic.c_str(), msg.c_str());
}

void publishAccessEvent(unsigned long card_code, int reader_id, bool granted) {
  if (!mqttClient.connected()) return;
  String topic = "elevators/" + String(THIS_ELEVATOR_ID) + "/access_event";
  JsonDocument doc;
  doc["card_code"] = String(card_code);
  doc["reader_id"] = reader_id;
  doc["status"] = granted ? "GRANTED" : "DENIED";
  String msg;
  serializeJson(doc, msg);
  mqttClient.publish(topic.c_str(), msg.c_str());
}


// ==========================================
//      HARDWARE LOGIC
// ==========================================
void setupReaders() {
  Serial.println("Init Readers...");
  // Reader 0
  readers.emplace_back(); readers[0].begin(1, 2);
  // Add other readers here if needed (up to 8)
  // ...
}

void setupRelays() {
  Serial.println("Init MCP23017 Relays...");
  Wire.begin();
  if (!mcp.begin_I2C()) {
    Serial.println("!! ERROR: MCP23017 Not Found !! Check Wiring.");
    while (1); 
  }
  for (int i = 0; i < 16; i++) {
    mcp.pinMode(i, OUTPUT);
    mcp.digitalWrite(i, HIGH); // Start OFF (High Impedance for Active Low)
  }
}

void checkWiegandReaders() {
  for (int i = 0; i < readers.size(); i++) {
    if (readers[i].available()) {
      unsigned long code = readers[i].getCode();
      Serial.printf("Card Swipe: %lu (Reader %d)\n", code, i);
      grantAccess(code, i);
    }
  }
}

void grantAccess(unsigned long card_code, int reader_id) {
  bool accessGranted = false;
  for (const auto& rule : permissions) {
    if (rule.card_code == card_code) {
      Serial.printf(">> Access GRANTED. Relay %d\n", rule.relay_to_activate);
      mcp.digitalWrite(rule.relay_to_activate, LOW);
      active_relays.push_back({rule.relay_to_activate, millis() + ACCESS_GRANTED_DURATION});
      accessGranted = true;
      break; 
    }
  }

  if (!accessGranted) Serial.println(">> Access DENIED.");
  publishAccessEvent(card_code, reader_id, accessGranted);
}

void checkRelayTimers() {
  if (active_relays.empty()) return;
  unsigned long current_time = millis();
  for (auto it = active_relays.begin(); it != active_relays.end(); ) {
    if (current_time >= it->turn_off_time) {
      Serial.printf("Relay %d Auto-OFF.\n", it->relay_number);
      mcp.digitalWrite(it->relay_number, HIGH);
      it = active_relays.erase(it);
    } else {
      ++it;
    }
  }
}

void checkSensors() {
  if (millis() - lastDebounceTime < 200) return;

  int currentDoor = digitalRead(PIN_DOOR_SENSOR);
  int currentFault = digitalRead(PIN_FAULT_SIGNAL);

  if (currentDoor != lastDoorState) {
    lastDebounceTime = millis();
    lastDoorState = currentDoor;
    if (currentDoor == LOW) publishStatus("DOOR_OPEN", "00");
    else publishStatus("DOOR_CLOSED", "00");
  }

  if (currentFault != lastFaultState) {
    lastDebounceTime = millis();
    lastFaultState = currentFault;
    if (currentFault == LOW) publishStatus("FAULT", "H1");
    else publishStatus("IDLE", "OK");
  }
}