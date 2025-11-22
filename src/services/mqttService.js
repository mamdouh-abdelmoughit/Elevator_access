// src/services/mqttService.js
import mqtt from 'mqtt';
import appEmitter from '../events/appEmitter.js';

const MQTT_BROKER = process.env.MQTT_BROKER_URL || 'mqtt://broker.hivemq.com:1883';
let client = null;

export function connect() {
  return new Promise((resolve, reject) => {
    client = mqtt.connect(MQTT_BROKER);

    client.on('connect', () => {
      console.log('MQTT connected to', MQTT_BROKER);
      // subscribe to elevator topics
      client.subscribe('elevators/+/access_event', (err) => {
        if (err) console.error('MQTT subscribe error', err);
      });
      client.subscribe('elevators/+/enrollment_event', (err) => {
        if (err) console.error('MQTT subscribe error', err);
      });
      client.subscribe('elevators/+/commands', (err) => {
        if (err) console.error('MQTT subscribe error', err);
      });
      resolve();
    });

    client.on('message', (topic, messageBuffer) => {
      const payload = messageBuffer.toString();
      // Emit into the app's event bus for centralized processing
      appEmitter.emit('mqttMessage', { topic, payload });
    });

    client.on('error', (err) => {
      console.error('MQTT error', err);
    });

    client.on('reconnect', () => {
      console.log('MQTT reconnecting...');
    });

    client.on('offline', () => {
      console.warn('MQTT offline');
    });
  });
}

export function publish(topic, message) {
  if (!client || !client.connected) {
    console.warn('MQTT client not connected — cannot publish', topic);
    return;
  }
  client.publish(topic, message, { qos: 0 }, (err) => {
    if (err) console.error('MQTT publish error', err);
  });
}
