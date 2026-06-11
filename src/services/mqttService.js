import mqtt from 'mqtt';
import appEmitter from '../events/appEmitter.js';
import prisma from '../db/prismaClient.js';
import { createLog } from './logService.js';

const MQTT_BROKER   = process.env.MQTT_BROKER_URL  || 'mqtt://broker.hivemq.com:1883';
const MQTT_USERNAME = process.env.MQTT_USERNAME     || '';
const MQTT_PASSWORD = process.env.MQTT_PASSWORD     || '';

// Cache of known elevator IDs — refreshed every 5 minutes
let knownElevatorIds = new Set();
let lastCacheRefresh = 0;

async function refreshElevatorCache() {
  const now = Date.now();
  if (now - lastCacheRefresh < 5 * 60 * 1000) return; // 5-min TTL
  try {
    const elevators = await prisma.elevator.findMany({ select: { id: true } });
    knownElevatorIds = new Set(elevators.map(e => e.id));
    lastCacheRefresh = now;
  } catch (e) {
    console.error('Failed to refresh elevator cache:', e.message);
  }
}

let client = null;

export function connect() {
  return new Promise((resolve, reject) => {
    const options = {
      clientId:  `backend-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
      clean:     true,
      reconnectPeriod: 5000,
    };

    // Only set credentials if they are configured
    if (MQTT_USERNAME) {
      options.username = MQTT_USERNAME;
      options.password = MQTT_PASSWORD;
    }

    client = mqtt.connect(MQTT_BROKER, options);

    client.on('connect', () => {
      console.log(`MQTT connected to ${MQTT_BROKER}`);
      client.subscribe('elevators/+/access_event');
      client.subscribe('elevators/+/enrollment_event');
      client.subscribe('elevators/+/status');
      resolve();
    });

    client.on('error', (err) => {
      console.error('MQTT error:', err.message);
    });

    client.on('reconnect', () => {
      console.log('MQTT reconnecting...');
    });

    client.on('message', async (topic, messageBuffer) => {
      const topicParts = topic.split('/');

      // Validate topic structure: elevators/{id}/{event}
      if (topicParts.length !== 3 || topicParts[0] !== 'elevators') return;

      const elevatorId = parseInt(topicParts[1]);
      const eventType  = topicParts[2];

      if (isNaN(elevatorId)) return;

      // Validate that this elevator ID actually exists — prevents rogue messages
      await refreshElevatorCache();
      if (!knownElevatorIds.has(elevatorId)) {
        console.warn(`MQTT: Ignored message from unknown elevator ID ${elevatorId}`);
        return;
      }

      const payloadString = messageBuffer.toString();

      if (eventType === 'status') {
        try {
          const data = JSON.parse(payloadString);
          const newStatus = data.code ? `${data.status}_${data.code}` : data.status;
          await prisma.elevator.update({
            where: { id: elevatorId },
            data: { currentStatus: newStatus, lastHeartbeat: new Date() },
          });
          await createLog('STATE_CHANGE', { status: newStatus, raw: data }, elevatorId);
        } catch (e) {
          console.error('Error updating elevator status:', e.message);
        }
      } else {
        appEmitter.emit('mqttMessage', { topic, payload: payloadString });
      }
    });

    // Reject if we can't connect within 15 seconds on first try
    const timeout = setTimeout(() => {
      if (!client.connected) {
        console.error('MQTT: Initial connection timeout — continuing without MQTT');
        resolve(); // Don't crash the server if MQTT is temporarily unavailable
      }
    }, 15000);

    client.once('connect', () => clearTimeout(timeout));
  });
}

export function publish(topic, message) {
  if (client && client.connected) {
    client.publish(topic, message, { qos: 1 }); // QoS 1 = at least once delivery
  } else {
    console.warn(`MQTT: Cannot publish to ${topic} — client not connected`);
  }
}
