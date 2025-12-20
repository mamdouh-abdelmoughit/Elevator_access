#include <Arduino.h>
#include <WiFi.h>
#include <PubSubClient.h>
#include <ArduinoHttpClient.h>
#include <ArduinoJson.h>
#include <vector>
#include <WIEGAND.h>
#include <Wire.h>

// ==========================================
//      USER CONFIGURATION
// ==========================================
const char* WIFI_SSID     = "La_Fibre_dOrange_2.4G_B283";      
const char* WIFI_PASSWORD = "YY93EHUEPFCCQ7QQUK";  
const char* BACKEND_SERVER = "192.168.11.108";      
const int   BACKEND_PORT   = 3000;
const char* MQTT_BROKER    = "broker.hivemq.com";
const int   MQTT_PORT      = 1883;

// ==========================================
//      PIN DEFINITIONS (FULL SIMULATION)
// ==========================================
// --- INPUTS (SENSORS & SIGNALS) ---
// Connect these to GND to activate them (Active Low)

// The "Perfect Row" on your board (9 to 14)
#define PIN_MONTEE        14  // Motion UP
#define PIN_DESCENTE      13  // Motion DOWN
#define PIN_GV            12  // Grande Vitesse
#define PIN_PV            11  // Petite Vitesse
#define PIN_INSPECTION    10  // Maintenance Mode
// Sensors moved to the next block
#define PIN_ML1           48  // Magnetic Sensor 1
#define PIN_ML2           47  // Magnetic Sensor 2
#define PIN_IMP_ARRET     45  // Stop Zone Pulse
#define PIN_IMP_PV        35  // Deceleration Pulse
#define PIN_EXTREME_HAUT  21  // Top Limit Switch
#define PIN_EXTREME_BAS   20  // Bottom Limit Switch

// --- GROUP 3: SAFETY & DOORS (New) ---
#define PIN_SEC_GENERALE  37  // General Safety Chain
#define PIN_SEC_PORTE     36  // Door Series Safety
#define PIN_OUVERTURE     38  // Door Opening Signal
#define PIN_FERMETURE     39  // Door Closing Signal
#define PIN_PHOTOCELLULE  40  // Light Curtain/Obstacle
// Sensors moved to the next block
#define PIN_DOOR_SENSOR   15  // Door State
#define PIN_FAULT_SIGNAL  16  // Generic Fault

// --- OUTPUTS (RELAYS) ---
// Keep these if you have them, otherwise move to 46, 3, 8
#define RELAY_OPEN_DOOR   6   
#define RELAY_CLOSE_DOOR  4   
#define RELAY_SHUTDOWN    5  
// --- NEW REMOTE COMMAND OUTPUTS ---
#define RELAY_REV_MODE    9   // Output to toggle Revision Mode
#define RELAY_REV_UP      46  // Output to simulate Up Button
#define RELAY_REV_DOWN    3   // Output to simulate Down Button
// --- READERS ---
// Using 18 and 17 because you listed them
#define READER_D0         18
#define READER_D1         17

#define ACCESS_GRANTED_DURATION 2000 

// ==========================================
//      SYSTEM VARIABLES
// ==========================================
int THIS_ELEVATOR_ID = -1; 
String DEVICE_MAC = "";

WiFiClient wifiClient;
PubSubClient mqttClient(wifiClient);
HttpClient httpClient(wifiClient, BACKEND_SERVER, BACKEND_PORT);
WIEGAND wg;

// Data Structures
struct PermissionRule { unsigned long card_code; int relay_to_activate; };
std::vector<PermissionRule> permissions;

struct RelayTimer { int relay_pin; unsigned long turn_off_time; };
std::vector<RelayTimer> active_relays;

// State Tracking
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
void checkElevatorState(); // <--- THE NEW LOGIC
void publishStatus(String status, String details);
void grantAccess(unsigned long card_code);
void publishAccessEvent(unsigned long card_code, bool granted);

// ==========================================
//      MAIN SETUP
// ==========================================
void setup() {
  Serial.begin(115200);
  delay(1000);
  Serial.println("\n\n--- ESP32 ELEVATOR CONTROLLER (FULL SIMULATION) ---");

  setupPins();
  wg.begin(READER_D0, READER_D1);
  setupWifi();

  // Auto-Discovery
  while (!getElevatorConfig()) {
    Serial.println("... Waiting for registration.");
    delay(5000); 
  }

  connectToMqtt();
  fetchPermissions(); 
  Serial.println("\n--- System Ready: Waiting for Signals ---");
}

void loop() {
  if (!mqttClient.connected()) connectToMqtt();
  mqttClient.loop(); 
  checkWiegandReaders();
  checkRelayTimers();
  checkElevatorState(); // Replaces old checkSensors()
}

// ==========================================
//      HARDWARE FUNCTIONS
// ==========================================
void setupPins() {
  // Inputs (Active Low logic - HIGH by default, LOW when wire touches GND)
  pinMode(PIN_DOOR_SENSOR, INPUT_PULLUP);
  pinMode(PIN_FAULT_SIGNAL, INPUT_PULLUP);
  
  pinMode(PIN_MONTEE, INPUT_PULLUP);
  pinMode(PIN_DESCENTE, INPUT_PULLUP);
  pinMode(PIN_GV, INPUT_PULLUP);
  pinMode(PIN_PV, INPUT_PULLUP);
  pinMode(PIN_INSPECTION, INPUT_PULLUP);
  
  // Group 2
  pinMode(PIN_ML1, INPUT_PULLUP);
  pinMode(PIN_ML2, INPUT_PULLUP);
  pinMode(PIN_IMP_ARRET, INPUT_PULLUP);
  pinMode(PIN_IMP_PV, INPUT_PULLUP);
  pinMode(PIN_EXTREME_HAUT, INPUT_PULLUP);
  pinMode(PIN_EXTREME_BAS, INPUT_PULLUP);

  // Group 3
  pinMode(PIN_SEC_GENERALE, INPUT_PULLUP);
  pinMode(PIN_SEC_PORTE, INPUT_PULLUP);
  pinMode(PIN_OUVERTURE, INPUT_PULLUP);
  pinMode(PIN_FERMETURE, INPUT_PULLUP);
  pinMode(PIN_PHOTOCELLULE, INPUT_PULLUP);

  // Outputs
  pinMode(RELAY_OPEN_DOOR, OUTPUT);
  pinMode(RELAY_CLOSE_DOOR, OUTPUT);
  pinMode(RELAY_SHUTDOWN, OUTPUT);
  pinMode(RELAY_REV_MODE, OUTPUT);
  pinMode(RELAY_REV_UP, OUTPUT);
  pinMode(RELAY_REV_DOWN, OUTPUT);
  
  // Default OFF (High for Active Low Relays)
  digitalWrite(RELAY_OPEN_DOOR, HIGH);
  digitalWrite(RELAY_CLOSE_DOOR, HIGH);
  digitalWrite(RELAY_SHUTDOWN, HIGH);
  digitalWrite(RELAY_REV_MODE, HIGH);
  digitalWrite(RELAY_REV_UP, HIGH);
  digitalWrite(RELAY_REV_DOWN, HIGH);  
}

void checkElevatorState() {
  if (millis() - lastDebounceTime < 500) return; 

  // --- 1. READ ALL 18 PINS (LOW = ACTIVE) ---
  
  // Group 1: Commands
  bool m_up       = digitalRead(PIN_MONTEE) == LOW;
  bool m_down     = digitalRead(PIN_DESCENTE) == LOW;
  bool m_gv       = digitalRead(PIN_GV) == LOW;
  bool m_pv       = digitalRead(PIN_PV) == LOW;
  bool m_insp     = digitalRead(PIN_INSPECTION) == LOW;
  
  // Group 2: Position Sensors
  bool s_ml1      = digitalRead(PIN_ML1) == LOW;
  bool s_ml2      = digitalRead(PIN_ML2) == LOW;
  bool s_imp_stop = digitalRead(PIN_IMP_ARRET) == LOW;
  bool s_imp_pv   = digitalRead(PIN_IMP_PV) == LOW;
  bool s_limit_h  = digitalRead(PIN_EXTREME_HAUT) == LOW;
  bool s_limit_l  = digitalRead(PIN_EXTREME_BAS) == LOW;

  // Group 3: Door & Safety Signals
  bool s_photo    = digitalRead(PIN_PHOTOCELLULE) == LOW;
  bool s_open_cmd = digitalRead(PIN_OUVERTURE) == LOW;
  bool s_close_cmd= digitalRead(PIN_FERMETURE) == LOW;
  
  // Safety Chains (Remember: HIGH means Broken/Triggered)
  bool s_gen_broken = digitalRead(PIN_SEC_GENERALE) == HIGH;
  bool s_door_broken = digitalRead(PIN_SEC_PORTE) == HIGH;

  // Group 4: Physical Sensors (I missed these before!)
  bool s_door_phys = digitalRead(PIN_DOOR_SENSOR) == LOW;
  bool s_fault     = digitalRead(PIN_FAULT_SIGNAL) == LOW;

  // --- 2. BUILD STATUS STRING (Check EVERYTHING) ---
  String activeStates = "";

  // Safety First
  if (s_gen_broken)  activeStates += "URGENCE + ";
  if (s_door_broken) activeStates += "SEC_PORTE_OPEN + ";
  if (s_fault)       activeStates += "FAULT_GENERAL + ";

  // Limits
  if (s_limit_h)     activeStates += "LIMIT_HAUT + ";
  if (s_limit_l)     activeStates += "LIMIT_BAS + ";

  // Maintenance
  if (m_insp)        activeStates += "INSPECTION + ";

  // Commands
  if (m_up)          activeStates += "CMD_MONTEE + ";
  if (m_down)        activeStates += "CMD_DESCENTE + ";
  if (m_gv)          activeStates += "CMD_GV + ";
  if (m_pv)          activeStates += "CMD_PV + ";

  // Position Sensors
  if (s_ml1)         activeStates += "ML1 + ";
  if (s_ml2)         activeStates += "ML2 + ";
  if (s_imp_stop)    activeStates += "IMP_ARRET + ";
  if (s_imp_pv)      activeStates += "IMP_PV + ";

  // Door Status
  if (s_photo)       activeStates += "OBSTACLE + ";
  if (s_open_cmd)    activeStates += "CMD_OUVERTURE + ";
  if (s_close_cmd)   activeStates += "CMD_FERMETURE + ";
  if (s_door_phys)   activeStates += "PORTE_PHYSIQUE_OPEN + ";

  // --- 3. CLEANUP & PUBLISH ---
  if (activeStates.length() > 0) {
    // Remove the last " + "
    if (activeStates.endsWith(" + ")) {
        activeStates = activeStates.substring(0, activeStates.length() - 3);
    }
  } else {
    activeStates = "IDLE";
  }

  // Only send if something changed
  if (activeStates != lastStatus) {
    lastDebounceTime = millis();
    lastStatus = activeStates;
    Serial.print("[STATE] ");
    Serial.println(activeStates);
    publishStatus(activeStates, "FULL_UPDATE");
  }
}

void checkWiegandReaders() {
  if(wg.available()) {
    unsigned long code = wg.getCode();
    Serial.printf("Card Swipe: %lu\n", code);
    grantAccess(code);
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