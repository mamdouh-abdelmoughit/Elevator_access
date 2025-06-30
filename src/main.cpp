#include <Arduino.h>
#include <WIEGAND.h>  // note the uppercase: WIEGAND.h
#include <Adafruit_MCP23X17.h>
#include <Wire.h>
#include <vector>

// ======================================================
//      CONFIGURATION
// ======================================================

#define NUM_READERS 8
#define NUM_RELAYS 14
#define ACCESS_GRANTED_DURATION 2000 // in milliseconds

// Create an instance for the I/O Expander that controls relays
Adafruit_MCP23X17  mcp;


// Create a vector to hold all our Wiegand reader objects
std::vector<WIEGAND> readers;

// --- DATA STRUCTURES ---
struct PermissionRule {
  unsigned long card_code;
  int reader_id;
  int relay_to_activate;
};
std::vector<PermissionRule> permissions;

struct RelayTimer {
  int relay_number;
  unsigned long turn_off_time;
};
std::vector<RelayTimer> active_relays;


// --- FUNCTION PROTOTYPES ---
void setupReaders();
void setupRelays();
void loadPermissions_Mock();
void checkWiegandReaders();
void checkRelayTimers();
void grantAccess(unsigned long card_code, int reader_id);


// ======================================================
//      MAIN SETUP & LOOP
// ======================================================
void setup() {
  Serial.begin(115200);
  while (!Serial); // Wait for serial connection
  Serial.println("\n--- Elevator Access Control System Booting Up ---");

  setupRelays();
  setupReaders();
  loadPermissions_Mock();

  Serial.println("\n--- System Ready ---");
}

void loop() {
  // In the main loop, we continuously check for new card swipes
  checkWiegandReaders();

  // We also check if any active relays need to be turned off
  checkRelayTimers();
}


// ======================================================
//      IMPLEMENTATION OF FUNCTIONS
// ======================================================

void setupReaders() {
  Serial.println("Initializing Wiegand readers...");
  // GPIO pins for each of the 8 readers {D0, D1}
  const int wiegand_pins[NUM_READERS][2] = {
    {1, 2}, {3, 4}, {5, 6}, {7, 10},
    {11, 12}, {13, 14}, {15, 16}, {17, 18}
  };

  // Create and initialize a Wiegand object for each reader
  for (int i = 0; i < NUM_READERS; i++) {
    readers.emplace_back(); // Add a new Wiegand object to our vector
    readers[i].begin(wiegand_pins[i][0], wiegand_pins[i][1]);
  }
}

void setupRelays() {
  Serial.println("Initializing relay controller (MCP23017)...");
  Wire.begin();
  if (!mcp.begin_I2C()) { // Use begin_I2C() for clarity
    Serial.println("Error: MCP23017 not found. Check wiring and address.");
    while (1); // Halt execution if the expander is not found
  }

  for (int i = 0; i < NUM_RELAYS; i++) {
    mcp.pinMode(i, OUTPUT);
    // Set initial state. Assuming relays are active LOW (LOW turns them ON).
    // So we write HIGH to keep them OFF initially.
    mcp.digitalWrite(i, HIGH);
  }
}

void loadPermissions_Mock() {
  Serial.println("Loading MOCK permissions...");
  permissions.push_back({23138, 0, 6});
  permissions.push_back({45814, 0, 1});
  permissions.push_back({45100, 0, 2});
  permissions.push_back({45100, 1, 7});
  permissions.push_back({38064, 2, 8});
  permissions.push_back({28880, 3, 9});
  permissions.push_back({34875, 4, 10});
  permissions.push_back({62663, 5, 11});
  permissions.push_back({61001, 6, 12});
  permissions.push_back({23138, 7, 13});
  Serial.printf("%d permission rules loaded.\n", permissions.size());
}

// NEW function to check all readers
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
    if (rule.card_code == card_code && rule.reader_id == reader_id) {
      Serial.printf("Access GRANTED for Reader %d. Activating relay %d.\n", reader_id, rule.relay_to_activate);
      mcp.digitalWrite(rule.relay_to_activate, LOW);
      active_relays.push_back({rule.relay_to_activate, millis() + ACCESS_GRANTED_DURATION});
      accessGranted = true;
      break;
    }
  }

  if (!accessGranted) {
    Serial.printf("Access DENIED for card %lu at Reader %d.\n", card_code, reader_id);
  }
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