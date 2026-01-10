#include <Arduino.h>
#include <WiFi.h>
#include <PubSubClient.h>
#include <ArduinoHttpClient.h>
#include <ArduinoJson.h>
#include <vector>
#include <WIEGAND.h>
#include <Wire.h>
#include <Adafruit_MCP23X17.h> // Required Library

// ==========================================
//      USER CONFIGURATION
// ==========================================
const char* WIFI_SSID     = "La_Fibre_dOrange_2.4G_B283";      
const char* WIFI_PASSWORD = "YY93EHUEPFCCQ7QQUK";  
const char* BACKEND_SERVER = "192.168.11.105";      
const int   BACKEND_PORT   = 3000;
const char* MQTT_BROKER    = "broker.hivemq.com";
const int   MQTT_PORT      = 1883;


// Reader Instances
WIEGAND readerF1; // Floor 1
WIEGAND readerF2; // Floor 2
WIEGAND readerF3; // Floor 3

const int RELAY_F1 = 20;
const int RELAY_F2 = 21;
const int RELAY_F3 = 47;
// ==========================================
//      PIN DEFINITIONS
// ==========================================
// --- ESP32 NATIVE PINS ---
#define I2C_SDA 11
#define I2C_SCL 12																			  
#define RELAY_OPEN_DOOR   6   
#define RELAY_CLOSE_DOOR  4   
#define RELAY_SHUTDOWN    5  									 
#define RELAY_REV_MODE    9   
#define RELAY_REV_UP      46  
#define RELAY_REV_DOWN    3   
// --- MCP23017 VIRTUAL PINS (Port A & B) ---
// Port A (0-7)
#define MCP_MONTEE      0
#define MCP_DESCENTE    1
#define MCP_GV          2
#define MCP_PV          3
#define MCP_INSPECTION  4
#define MCP_ML1         5
#define MCP_ML2         6
#define MCP_IMP_ARRET   7
#define PIN_OUVERTURE   38  
#define PIN_FERMETURE   39  
// Port B (8-15)
#define MCP_IMP_PV      8
#define MCP_LIMIT_H     9
#define MCP_LIMIT_L     10
#define MCP_SEC_GEN     11
#define MCP_SEC_PORTE   12
#define MCP_PHOTO       13
#define MCP_DOOR_PHYS   14
#define MCP_FAULT       15

#define ACCESS_GRANTED_DURATION 2000 

// ==========================================
//      SYSTEM VARIABLES
// ==========================================
int THIS_ELEVATOR_ID = -1; 
String DEVICE_MAC = "";

Adafruit_MCP23X17 mcp;
WiFiClient wifiClient;
PubSubClient mqttClient(wifiClient);
HttpClient httpClient(wifiClient, BACKEND_SERVER, BACKEND_PORT);
WIEGAND wg;
			  
struct PermissionRule { unsigned long card_code; int relay_to_activate; };
std::vector<PermissionRule> permissions;

struct RelayTimer { int relay_pin; unsigned long turn_off_time; };
std::vector<RelayTimer> active_relays;
			 
String lastStatus = "IDLE";
unsigned long lastDebounceTime = 0;

// Function Prototypes
void setupWifi();
bool getElevatorConfig();
void connectToMqtt();
void fetchPermissions();
void mqttCallback(char* topic, byte* payload, unsigned int length);
void setupPins();
void checkWiegandReaders();
void checkRelayTimers();
void checkElevatorState(); 
void publishStatus(String status, String details);
void grantAccess(unsigned long card_code);
void publishAccessEvent(unsigned long card_code, bool granted);
void pressCallButton(int relayPin, String floorName);
void printWhitelist();
bool checkGlobalAccess(unsigned long card_code);
// ==========================================
//      MAIN SETUP
// ==========================================
void setup() {
  Serial.begin(115200);
  delay(1000);
  Serial.println("\n--- BIOSWITCH: ESP32 + MCP23017 READY ---");

  // Initialize I2C and MCP
  Wire.begin(I2C_SDA, I2C_SCL);
  if (!mcp.begin_I2C(0x20)) {
    Serial.println("Error: MCP23017 not found! Check wiring.");
  //  while (1);
  }

  pinMode(18, INPUT_PULLUP);
  pinMode(17, INPUT_PULLUP);

  pinMode(16, INPUT_PULLUP);
  pinMode(15, INPUT_PULLUP);

  pinMode(14, INPUT_PULLUP);
  pinMode(13, INPUT_PULLUP);

  readerF1.begin(18, 17);
  readerF2.begin(16, 15);
  readerF3.begin(14, 13);

  // Initialize Relays
  pinMode(RELAY_F1, OUTPUT);
  pinMode(RELAY_F2, OUTPUT);
  pinMode(RELAY_F3, OUTPUT);
  
  // Set Relays to OFF (Assuming Active LOW relay board, HIGH = OFF)
  digitalWrite(RELAY_F1, HIGH); 
  digitalWrite(RELAY_F2, HIGH);
  digitalWrite(RELAY_F3, HIGH);

  setupPins();
  setupWifi();

				   
  while (!getElevatorConfig()) {
    Serial.println("... Waiting for registration.");
    delay(5000); 
  }

  connectToMqtt();
  fetchPermissions(); 
																
}

void loop() {
  if (!mqttClient.connected()) connectToMqtt();
  mqttClient.loop(); 
  //checkWiegandReaders();
  checkRelayTimers();
  //checkElevatorState(); 

 // --- READER 1 (Floor 1) ---
  if (readerF1.available()) {
    unsigned long code = readerF1.getCode();
    Serial.print("\n>>> Reader 1 Scanned: "); Serial.println(code);
    
    // Check if this card exists in our global list
    if (checkGlobalAccess(code)) {
        // If YES: 1. Open Door Relay, 2. Call Elevator to Floor 1
        Serial.println(">> ✅ Access Granted (Global Rule)");
        digitalWrite(RELAY_OPEN_DOOR, LOW); 
        active_relays.push_back({RELAY_OPEN_DOOR, millis() + 2000}); // Keep open for 2s
        
        pressCallButton(RELAY_F1, "Floor 1"); // Specific call for this reader location
    } else {
        Serial.println(">> ❌ Access Denied");
    }
  }

  // --- READER 2 (Floor 2) ---
  if (readerF2.available()) {
    unsigned long code = readerF2.getCode();
    Serial.print("\n>>> Reader 2 Scanned: "); Serial.println(code);

    if (checkGlobalAccess(code)) {
        Serial.println(">> ✅ Access Granted (Global Rule)");
        digitalWrite(RELAY_OPEN_DOOR, LOW); 
        active_relays.push_back({RELAY_OPEN_DOOR, millis() + 2000});
        
        pressCallButton(RELAY_F2, "Floor 2"); // Specific call for this reader location
    } else {
        Serial.println(">> ❌ Access Denied");
    }
  }

  // --- READER 3 (Floor 3) ---
  if (readerF3.available()) {
    unsigned long code = readerF3.getCode();
    Serial.print("\n>>> Reader 3 Scanned: "); Serial.println(code);

    if (checkGlobalAccess(code)) {
        Serial.println(">> ✅ Access Granted (Global Rule)");
        digitalWrite(RELAY_OPEN_DOOR, LOW); 
        active_relays.push_back({RELAY_OPEN_DOOR, millis() + 2000});
        
        pressCallButton(RELAY_F3, "Floor 3"); // Specific call for this reader location
    } else {
        Serial.println(">> ❌ Access Denied");
    }
  }
}
bool checkGlobalAccess(unsigned long card_code) {
  // Look through the ENTIRE list. If card is found, return true.
  for (const auto& rule : permissions) {
    if (rule.card_code == card_code) {
      return true;
    }
  }
  return false;
}
// ==========================================
//      HARDWARE FUNCTIONS
// ==========================================
void setupPins() {
  // --- 1. ESP32 Relay Outputs ---
  int relayPins[] = {6, 4, 5, 9, 46, 3};
  for(int p : relayPins) {
    pinMode(p, OUTPUT);
    digitalWrite(p, HIGH); 
  }

  // --- 2. ESP32 Native Inputs (The 2 we moved back) ---
  pinMode(PIN_OUVERTURE, INPUT_PULLUP);
  pinMode(PIN_FERMETURE, INPUT_PULLUP);

  // --- 3. MCP23017 Expansion Inputs ---
  for (int i = 0; i < 16; i++) {
    mcp.pinMode(i, INPUT_PULLUP); 
  }
}

void pressCallButton(int relayPin, String floorName) {
  Serial.println(">> Action: Calling elevator to " + floorName);
  
  digitalWrite(relayPin, LOW);  // Close the relay contact (Press button)
  delay(1000);                  // Wait 1 second
  digitalWrite(relayPin, HIGH); // Open the relay contact (Release button)
  
  Serial.println(">> Call Completed.");
}

void checkElevatorState() {
  if (millis() - lastDebounceTime < 500) return; 

  // --- 1. READ FROM MCP23017 (Sensors) ---
  bool m_up       = mcp.digitalRead(MCP_MONTEE) == LOW;
  bool m_down     = mcp.digitalRead(MCP_DESCENTE) == LOW;
  bool m_gv       = mcp.digitalRead(MCP_GV) == LOW;
  bool m_pv       = mcp.digitalRead(MCP_PV) == LOW;
  bool m_insp     = mcp.digitalRead(MCP_INSPECTION) == LOW;
  bool s_ml1      = mcp.digitalRead(MCP_ML1) == LOW;
  bool s_ml2      = mcp.digitalRead(MCP_ML2) == LOW;
  bool s_imp_stop = mcp.digitalRead(MCP_IMP_ARRET) == LOW;
  bool s_imp_pv   = mcp.digitalRead(MCP_IMP_PV) == LOW;
  bool s_limit_h  = mcp.digitalRead(MCP_LIMIT_H) == LOW;
  bool s_limit_l  = mcp.digitalRead(MCP_LIMIT_L) == LOW;
  bool s_photo    = mcp.digitalRead(MCP_PHOTO) == LOW;
  bool s_door_phys= mcp.digitalRead(MCP_DOOR_PHYS) == LOW;
  bool s_fault    = mcp.digitalRead(MCP_FAULT) == LOW;

  // Safety Chains (Active High = Problem)
  bool s_gen_broken  = mcp.digitalRead(MCP_SEC_GEN) == HIGH;
  bool s_door_broken = mcp.digitalRead(MCP_SEC_PORTE) == HIGH;

  // --- 2. READ FROM ESP32 (Door Command Signals) ---
  bool s_open_sig  = digitalRead(PIN_OUVERTURE) == LOW;
  bool s_close_sig = digitalRead(PIN_FERMETURE) == LOW;

  // --- 3. BUILD STATUS STRING ---
  String activeStates = "";

  if (s_gen_broken)  activeStates += "URGENCE + ";
  if (s_door_broken) activeStates += "SEC_PORTE_OPEN + ";
  if (s_fault)       activeStates += "FAULT_GENERAL + ";
  if (s_limit_h)     activeStates += "LIMIT_HAUT + ";
  if (s_limit_l)     activeStates += "LIMIT_BAS + ";
  if (m_insp)        activeStates += "INSPECTION + ";
  if (m_up)          activeStates += "CMD_MONTEE + ";
  if (m_down)        activeStates += "CMD_DESCENTE + ";
  if (m_gv)          activeStates += "CMD_GV + ";
  if (m_pv)          activeStates += "CMD_PV + ";
  if (s_ml1)         activeStates += "ML1 + ";
  if (s_ml2)         activeStates += "ML2 + ";
  if (s_imp_stop)    activeStates += "IMP_ARRET + ";
  if (s_imp_pv)      activeStates += "IMP_PV + ";
  if (s_photo)       activeStates += "OBSTACLE + ";
  if (s_door_phys)   activeStates += "PORTE_PHYSIQUE_OPEN + ";
  
  // These use the signals read from ESP32
  if (s_open_sig)    activeStates += "CMD_OUVERTURE + ";
  if (s_close_sig)   activeStates += "CMD_FERMETURE + ";

  // Cleanup & Publish
  if (activeStates.length() > 0) {
    if (activeStates.endsWith(" + ")) {
        activeStates = activeStates.substring(0, activeStates.length() - 3);
    }
  } else {
    activeStates = "IDLE";
  }

  if (activeStates != lastStatus) {
    lastDebounceTime = millis();
    lastStatus = activeStates;
    Serial.print("[STATE] "); Serial.println(activeStates);
    publishStatus(activeStates, "FULL_UPDATE");
  }
}

void grantAccess(unsigned long card_code) {
  bool accessGranted = false;
  for (const auto& rule : permissions) {
    if (rule.card_code == card_code) {
      Serial.println(">> Access GRANTED!");
      digitalWrite(RELAY_OPEN_DOOR, LOW); 
      active_relays.push_back({RELAY_OPEN_DOOR, millis() + ACCESS_GRANTED_DURATION});
      accessGranted = true;
      break; 
    }
  }
  if (!accessGranted) Serial.println(">> Access DENIED");
  publishAccessEvent(card_code, accessGranted);
}

void checkRelayTimers() {
  if (active_relays.empty()) return;
  unsigned long current_time = millis();
  for (auto it = active_relays.begin(); it != active_relays.end(); ) {
    if (current_time >= it->turn_off_time) {
      digitalWrite(it->relay_pin, HIGH);
      it = active_relays.erase(it);
    } else {
      ++it;
    }
  }
}

// ==========================================
//      NETWORK & API
// ==========================================
bool getElevatorConfig() {
  DEVICE_MAC = WiFi.macAddress();
  Serial.print("My Device MAC: "); Serial.println(DEVICE_MAC);
  // ✅ REVERTED TO YOUR WORKING PATH
  String apiPath = "/elevators/identify?mac=" + DEVICE_MAC; 
  httpClient.get(apiPath);
  
  if (httpClient.responseStatusCode() == 200) {
    JsonDocument doc;
    deserializeJson(doc, httpClient.responseBody());
    THIS_ELEVATOR_ID = doc["id"];
    Serial.printf(">> REGISTERED! ID: %d\n", THIS_ELEVATOR_ID);
    return true;
  } 
  return false;
}

void fetchPermissions() {
  Serial.println("Syncing Permissions...");
  // ✅ REVERTED TO YOUR WORKING PATH
  String apiPath = "/permissions/elevator/" + String(THIS_ELEVATOR_ID);
  httpClient.get(apiPath);
  if (httpClient.responseStatusCode() == 200) {
    JsonDocument doc;
    deserializeJson(doc, httpClient.responseBody());
    permissions.clear();
    for (JsonObject rule : doc.as<JsonArray>()) {
      unsigned long code = strtoul(rule["card"]["code"], NULL, 10);
      if (code > 0) permissions.push_back({code, 1});
    }
    Serial.printf("Permissions Loaded: %d rules.\n", permissions.size());
  }
  Serial.printf("Permissions Loaded: %d rules.\n", permissions.size());
    printWhitelist(); // <--- ADD THIS LINE HERE
}

void mqttCallback(char* topic, byte* payload, unsigned int length) {
  payload[length] = '\0'; 
  String message = (char*)payload;
  StaticJsonDocument<256> doc;
  deserializeJson(doc, message);
  const char* command = doc["command"];

  if (strcmp(command, "UPDATE_PERMISSIONS") == 0) fetchPermissions();
  else if (strcmp(command, "REMOTE_CONTROL") == 0) {
    const char* action = doc["action"];

    // --- DOOR 1: OPEN ---
    if (strcmp(action, "OPEN_DOOR_ON") == 0) {
      digitalWrite(RELAY_OPEN_DOOR, LOW); // ON
      Serial.println(">> CMD: OPEN DOOR -> ON");
    }
    else if (strcmp(action, "OPEN_DOOR_OFF") == 0) {
      digitalWrite(RELAY_OPEN_DOOR, HIGH); // OFF
      Serial.println(">> CMD: OPEN DOOR -> OFF");
    }

    // --- DOOR 2: CLOSE ---
    else if (strcmp(action, "CLOSE_DOOR_ON") == 0) {
      digitalWrite(RELAY_CLOSE_DOOR, LOW); 
      Serial.println(">> CMD: CLOSE DOOR -> ON");
    }
    else if (strcmp(action, "CLOSE_DOOR_OFF") == 0) {
      digitalWrite(RELAY_CLOSE_DOOR, HIGH); 
      Serial.println(">> CMD: CLOSE DOOR -> OFF");
    }

    // --- SHUTDOWN ---
    else if (strcmp(action, "SHUTDOWN_ON") == 0) {
       digitalWrite(RELAY_SHUTDOWN, LOW);
       Serial.println(">> CMD: SHUTDOWN -> ON (ACTIVE)");
    }
    else if (strcmp(action, "SHUTDOWN_OFF") == 0) {
       digitalWrite(RELAY_SHUTDOWN, HIGH);
       Serial.println(">> CMD: SHUTDOWN -> OFF (NORMAL)");
    }

    // --- REVISION MODE ---
    else if (strcmp(action, "REVISION_MODE_ON") == 0) {
       digitalWrite(RELAY_REV_MODE, LOW);
       Serial.println(">> CMD: REV MODE -> ON");
    }
    else if (strcmp(action, "REVISION_MODE_OFF") == 0) {
       digitalWrite(RELAY_REV_MODE, HIGH);
       Serial.println(">> CMD: REV MODE -> OFF");
    }

    // --- REV MONTEE ---
    else if (strcmp(action, "REV_MONTEE_ON") == 0) {
       digitalWrite(RELAY_REV_UP, LOW);
       Serial.println(">> CMD: REV UP -> ON");
    }
    else if (strcmp(action, "REV_MONTEE_OFF") == 0) {
       digitalWrite(RELAY_REV_UP, HIGH);
       Serial.println(">> CMD: REV UP -> OFF");
    }

    // --- REV DESCENTE ---
    else if (strcmp(action, "REV_DESCENTE_ON") == 0) {
       digitalWrite(RELAY_REV_DOWN, LOW);
       Serial.println(">> CMD: REV DOWN -> ON");
    }
    else if (strcmp(action, "REV_DESCENTE_OFF") == 0) {
       digitalWrite(RELAY_REV_DOWN, HIGH);
       Serial.println(">> CMD: REV DOWN -> OFF");
    }
  }
}
void publishStatus(String status, String details) {
  if (!mqttClient.connected()) return;
  String topic = "elevators/" + String(THIS_ELEVATOR_ID) + "/status";
  JsonDocument doc; 
  doc["status"] = status; 
  doc["details"] = details;
  String msg; serializeJson(doc, msg);
  mqttClient.publish(topic.c_str(), msg.c_str());
}

void publishAccessEvent(unsigned long card_code, bool granted) {
  if (!mqttClient.connected()) return;
  String topic = "elevators/" + String(THIS_ELEVATOR_ID) + "/access_event";
  JsonDocument doc;
  doc["card_code"] = String(card_code);
  doc["reader_id"] = 0;
  doc["status"] = granted ? "GRANTED" : "DENIED";
  String msg; serializeJson(doc, msg);
  mqttClient.publish(topic.c_str(), msg.c_str());
}

void setupWifi() {
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  while (WiFi.status() != WL_CONNECTED) delay(500);
  Serial.println("WiFi Connected");
}

void printWhitelist() {
  Serial.println("\n--- 📋 CURRENT WHITELIST (Allowed Cards) ---");
  if (permissions.empty()) {
    Serial.println("⚠️ MEMORY IS EMPTY! No cards are allowed.");
  } else {
    for (int i = 0; i < permissions.size(); i++) {
      Serial.print("Rule #"); Serial.print(i + 1);
      Serial.print(": Card ["); Serial.print(permissions[i].card_code);
      Serial.print("] -> Relay ["); Serial.print(permissions[i].relay_to_activate);
      Serial.println("]");
    }
  }
  Serial.println("--------------------------------------------\n");
}

void connectToMqtt() {
  if (THIS_ELEVATOR_ID == -1) return;
  mqttClient.setServer(MQTT_BROKER, MQTT_PORT);
  mqttClient.setCallback(mqttCallback);
  while (!mqttClient.connected()) {
    String clientId = "esp32-" + String(THIS_ELEVATOR_ID) + "-" + String(random(999));
    if (mqttClient.connect(clientId.c_str())) {
      Serial.println("MQTT Connected!");
      mqttClient.subscribe(("elevators/" + String(THIS_ELEVATOR_ID) + "/commands").c_str());
    } else delay(5000);
  }
}