// src/events/eventListeners.js
import appEmitter from './appEmitter.js';
import { handleAccessEvent, handleEnrollmentEvent } from '../api/controllers/accessController.js';

export function initializeEventListeners() {
    console.log('Initializing event listeners...');
    
    appEmitter.on('mqttMessage', (data) => {
        const { eventType, topic, payload } = data;
        const topicParts = topic.split('/');
        const elevatorIdString = topicParts[1];
        const elevatorId = parseInt(elevatorIdString.replace('ELEVATOR_', ''));

        try {
            const parsedPayload = JSON.parse(payload);

            if (eventType === 'access_event') {
                const cardCode = BigInt(parsedPayload.card_code);
                if (!isNaN(elevatorId) && cardCode) {
                    handleAccessEvent(elevatorId, cardCode);
                }
            } else if (eventType === 'enrollment_event') {
                const newCardCode = BigInt(parsedPayload.new_card_code);
                if (!isNaN(elevatorId) && newCardCode) {
                    handleEnrollmentEvent(elevatorId, newCardCode);
                }
            }
        } catch (e) {
            console.error(`Failed to process MQTT message on topic ${topic}:`, e);
        }
    });

    console.log('Event listeners initialized.');
}