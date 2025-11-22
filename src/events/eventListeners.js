// src/events/eventListeners.js
import appEmitter from './appEmitter.js';
import { handleAccessEvent, handleEnrollmentEvent } from '../api/controllers/accessController.js';

export function initializeEventListeners() {
  console.log('Initializing event listeners...');

  appEmitter.on('mqttMessage', (data) => {
    try {
      const { topic, payload } = data;
      const topicParts = topic.split('/'); // e.g. ["elevators", "3", "access_event"]
      const elevatorSegment = topicParts[1] || '';
      const elevatorIdMatch = elevatorSegment.match(/(\d+)$/);
      const elevatorId = elevatorIdMatch ? parseInt(elevatorIdMatch[1], 10) : NaN;

      if (isNaN(elevatorId)) {
        console.warn(`Could not parse elevator id from topic: ${topic}`);
        return;
      }

      let parsedPayload;
      try { parsedPayload = JSON.parse(payload); } catch (e) { console.warn('Invalid payload JSON', payload); return; }

      const event = topicParts[2] || parsedPayload.eventType;

      if (event === 'access_event' || event === 'access') {
        const cardCode = parsedPayload.card_code?.toString();
        if (!cardCode) {
          console.warn('Missing card_code in payload', parsedPayload);
          return;
        }
        handleAccessEvent(elevatorId, cardCode);
      } else if (event === 'enrollment_event' || event === 'enrollment') {
        const newCardCode = parsedPayload.new_card_code?.toString();
        if (!newCardCode) {
          console.warn('Missing new_card_code in payload', parsedPayload);
          return;
        }
        handleEnrollmentEvent(elevatorId, newCardCode);
      } else {
        console.log('Unhandled mqtt event type:', event);
      }
    } catch (e) {
      console.error('Failed to process mqttMessage event:', e);
    }
  });

  console.log('Event listeners initialized.');
}
