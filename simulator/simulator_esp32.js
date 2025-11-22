// simulator/simulate_esp32.js

import mqtt from 'mqtt';
import http from 'http';

// --- CONFIGURATION (Match this with your ESP32's config) ---
const BACKEND_SERVER = 'localhost'; // Since this runs on the same machine
const BACKEND_PORT = 3000;
const MQTT_BROKER_URL = 'wss://broker.hivemq.com:8884/mqtt';
const THIS_ELEVATOR_ID = 1;

// --- SIMULATION VARIABLES ---
let permissions = []; // The simulator will store permissions just like the ESP32

// ======================================================
//      MQTT CLIENT LOGIC
// ======================================================
const mqttClient = mqtt.connect(MQTT_BROKER_URL, {});

mqttClient.on('connect', () => {
    console.log('[SIMULATOR] MQTT Client connected to broker!');
    const commandTopic = `elevators/${THIS_ELEVATOR_ID}/commands`;
    mqttClient.subscribe(commandTopic, () => {
        console.log(`[SIMULATOR] Subscribed to command topic: ${commandTopic}`);
    });
});

mqttClient.on('message', (topic, message) => {
    const msg = message.toString();
    console.log(`[SIMULATOR] Received MQTT Command: ${msg} on topic ${topic}`);
    const command = JSON.parse(msg);

    if (command.command === "UPDATE_PERMISSIONS") {
        console.log("[SIMULATOR] Received command to update permissions. Fetching now...");
        fetchPermissions();
    }
    // Add other command handlers here if needed (e.g., REMOTE_UNLOCK)
});

// ======================================================
//      HTTP CLIENT LOGIC (to fetch permissions)
// ======================================================
function fetchPermissions() {
    console.log('\n[SIMULATOR] Fetching permissions from backend...');
    const options = {
        hostname: BACKEND_SERVER,
        port: BACKEND_PORT,
        path: `/permissions/elevator/${THIS_ELEVATOR_ID}`,
        method: 'GET',
    };

    const req = http.request(options, res => {
        console.log(`[SIMULATOR] HTTP Status: ${res.statusCode}`);
        let data = '';
        res.on('data', chunk => { data += chunk; });
        res.on('end', () => {
            if (res.statusCode === 200) {
                console.log("[SIMULATOR] Response received, parsing permissions...");
                const parsedData = JSON.parse(data);
                permissions = parsedData; // Store the fetched permissions
                console.log(`[SIMULATOR] Successfully loaded ${permissions.length} permission rules.`);
                console.log(permissions);
            } else {
                console.log("[SIMULATOR] Failed to fetch permissions.");
            }
        });
    });

    req.on('error', error => console.error('[SIMULATOR] HTTP Request Error:', error));
    req.end();
}

// ======================================================
//      SIMULATION LOGIC
// ======================================================
function simulateCardSwipe(cardCode, readerId) {
    console.log(`\n>>> Simulating swipe of card [${cardCode}] on reader [${readerId}] <<<`);
    
    // The simulator can even check its own permissions list first
    const rule = permissions.find(p => p.card.code == cardCode);
    const isGranted = !!rule; // Is true if a rule was found, false otherwise

    console.log(`[SIMULATOR] Local check: Access ${isGranted ? 'GRANTED' : 'DENIED'}`);
    
    // Now, publish the event to the backend for logging
    const topic = `elevators/${THIS_ELEVATOR_ID}/access_event`;
    const message = JSON.stringify({
        card_code: cardCode.toString(),
        reader_id: readerId,
        status: isGranted ? "GRANTED" : "DENIED"
    });
    
    mqttClient.publish(topic, message);
    console.log(`[SIMULATOR] Published access event to topic: ${topic}`);
}

// ======================================================
//      MAIN EXECUTION
// ======================================================
function runSimulation() {
    // 1. Fetch permissions on startup
    fetchPermissions();

    // 2. Simulate a series of card swipes with delays
    // A valid card that should be in your database
    setTimeout(() => simulateCardSwipe(23138, 0), 5000); 

    // An invalid card that is not in your database
    setTimeout(() => simulateCardSwipe(999999, 1), 10000); 

    // Another valid card
    setTimeout(() => simulateCardSwipe(45814, 3), 15000); 
}

// Start the simulation
runSimulation();