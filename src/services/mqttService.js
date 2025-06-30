// src/services/mqttService.js

import { connect as _connect } from 'mqtt';

// --- Configuration ---
// NEW: We are using the Secure WebSocket protocol (wss) on port 8884.
// This is much more likely to get through firewalls.
const MQTT_BROKER_URL = 'wss://broker.hivemq.com:8884/mqtt';

// The mqtt.connect() function can take an options object.
// We don't strictly need it for this URL, but it's good practice.
const options = {
  // You can add options like username, password, etc. here if needed
};

const client = _connect(MQTT_BROKER_URL, options);

// Define the topics we will use. The '+' is a wildcard for one level.
const TOPIC_ACCESS_EVENTS = 'elevators/+/access_event'; // Listen for swipes from ANY elevator
const TOPIC_ENROLLMENT_EVENTS = 'elevators/+/enrollment_event'; // Listen for new cards

// --- Connection Logic ---

// This function will be called from our main index.js to start the service
const connect = () => {
    client.on('connect', () => {
        console.log('MQTT Client connected to broker!');

        // Subscribe to the topics after a successful connection
        client.subscribe(TOPIC_ACCESS_EVENTS, (err) => {
            if (!err) {
                console.log(`Subscribed successfully to: ${TOPIC_ACCESS_EVENTS}`);
            }
        });
        
        client.subscribe(TOPIC_ENROLLMENT_EVENTS, (err) => {
            if (!err) {
                console.log(`Subscribed successfully to: ${TOPIC_ENROLLMENT_EVENTS}`);
            }
        });
    });

    // --- Message Handling Logic ---
    client.on('message', (topic, message) => {
        const messageString = message.toString();
        console.log(`\nReceived message on topic: ${topic}`);
        console.log(`Message payload: ${messageString}`);

        // Split the topic string to find the elevator ID
        const topicParts = topic.split('/'); // e.g., ["elevators", "ELEVATOR_01", "access_event"]
        
        if (topicParts.length === 3 && topicParts[2] === 'access_event') {
            const elevatorIdString = topicParts[1]; // e.g., "ELEVATOR_01" -> we need the number
            const elevatorId = parseInt(elevatorIdString.replace('ELEVATOR_', ''));

            try {
                const payload = JSON.parse(messageString);
                const cardCode = BigInt(payload.card_code);

                if (!isNaN(elevatorId) && cardCode) {
                    // Call our controller to handle the logic
                    accessController.handleAccessEvent(elevatorId, cardCode);
                }
            } catch (e) {
                console.error("Failed to parse JSON message or extract data:", e);
            }
        }

        // TODO: Add handler for 'enrollment_event' topic
    });

    // --- Error Handling ---
    client.on('error', (error) => {
        console.error('MQTT Client Error:', error);
        client.end(); // Close connection on error
    });

    client.on('close', () => {
        console.log('MQTT Client disconnected.');
    });
};

// --- Publishing Logic (for sending commands TO the ESP32) ---

const publish = (topic, message) => {
    console.log(`Publishing to topic: ${topic}`);
    client.publish(topic, message);
}

// Export the functions so other parts of our app can use them
export default {
    connect,
    publish
};