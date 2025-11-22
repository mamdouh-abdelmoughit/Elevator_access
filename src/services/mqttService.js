// src/services/mqttService.js
import mqtt from 'mqtt';
import appEmitter from '../events/appEmitter.js';
import prisma from '../db/prismaClient.js'; // Import Prisma


const MQTT_BROKER = process.env.MQTT_BROKER_URL || 'mqtt://broker.hivemq.com:1883';
let client = null;

export function connect() {
  return new Promise((resolve, reject) => {
    client = mqtt.connect(MQTT_BROKER);

    client.on('connect', () => {
      console.log('MQTT connected');
      client.subscribe('elevators/+/access_event');
      client.subscribe('elevators/+/enrollment_event');
      client.subscribe('elevators/+/status'); // <--- LISTEN FOR STATUS
      resolve();
    });

    client.on('message', async (topic, messageBuffer) => {
      const payloadString = messageBuffer.toString();
      
      // Extract Elevator ID
      const topicParts = topic.split('/'); 
      const elevatorId = parseInt(topicParts[1]);

      // Handle STATUS updates directly here (Fastest way)
      if (topicParts[2] === 'status') {
        try {
          const data = JSON.parse(payloadString);
          // data = { status: "FAULT", code: "H1" }
          console.log(`[STATUS] Elevator ${elevatorId}: ${data.status} (${data.code || ''})`);
          
          await prisma.elevator.update({
            where: { id: elevatorId },
            data: { 
              currentStatus: data.code ? `${data.status}_${data.code}` : data.status, 
              lastHeartbeat: new Date() 
            }
          });
        } catch (e) {
          console.error("Error updating elevator status:", e);
        }
      } else {
        // Pass other events (access/enrollment) to the Event Emitter
        appEmitter.emit('mqttMessage', { topic, payload: payloadString });
      }
    });
  });
}

export function publish(topic, message) {
  if (client && client.connected) {
    client.publish(topic, message);
  }
}
