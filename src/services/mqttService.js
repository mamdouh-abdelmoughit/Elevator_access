// src/services/mqttService.js
import mqtt from 'mqtt';
import appEmitter from '../events/appEmitter.js'; // Import our new event emitter

const MQTT_BROKER_URL = 'wss://broker.hivemq.com:8884/mqtt';
const client = mqtt.connect(MQTT_BROKER_URL, {});

const TOPIC_ACCESS_EVENTS = 'elevators/+/access_event';
const TOPIC_ENROLLMENT_EVENTS = 'elevators/+/enrollment_event';

const connect = () => {
    client.on('connect', () => {
        console.log('MQTT Client connected to broker!');
        client.subscribe(TOPIC_ACCESS_EVENTS, () => console.log(`Subscribed to: ${TOPIC_ACCESS_EVENTS}`));
        client.subscribe(TOPIC_ENROLLMENT_EVENTS, () => console.log(`Subscribed to: ${TOPIC_ENROLLMENT_EVENTS}`));
    });

    client.on('message', (topic, message) => {
        const topicParts = topic.split('/');
        const eventType = topicParts[2]; // 'access_event' or 'enrollment_event'

        // Emit a generic 'mqttMessage' event that our app can listen for.
        // We pass all the necessary info in the payload.
        appEmitter.emit('mqttMessage', {
            eventType: eventType,
            topic: topic,
            payload: message.toString()
        });
    });

    client.on('error', (error) => console.error('MQTT Client Error:', error));
    client.on('close', () => console.log('MQTT Client disconnected.'));
};

const publish = (topic, message) => {
    console.log(`Publishing to topic: ${topic}`);
    client.publish(topic, message);
};

export { connect, publish };