// src/api/controllers/accessController.js
import prisma from '../../db/prismaClient.js';
import { publish } from '../../services/mqttService.js';
import { get as getEnrollmentState } from '../../services/enrollmentService.js';
import { createLog } from '../../services/logService.js';

// --- FUNCTION 1: Handles regular card swipes ---
export const handleAccessEvent = async (elevatorId, cardCode) => {
  const cardCodeString = cardCode.toString();
  console.log(`Processing access request for Card [${cardCodeString}] at Elevator [${elevatorId}]`);

  try {
    // 1) Find the card record first (explicit, clear)
    const card = await prisma.card.findUnique({
      where: { code: cardCodeString } // <<-- use the string code
    });

    // If no card found, deny immediately and log the attempt
    if (!card) {
      console.log(`Access DENIED. Unknown card [${cardCodeString}].`);
      createLog("ACCESS_ATTEMPT", {
        cardCode: cardCodeString,
        status: "DENIED",
        reason: "UNKNOWN_CARD"
      }, elevatorId);

      // Publish DENIED back to device (use commands topic so device subscribed receives it)
      const denyTopic = `elevators/${elevatorId}/commands`;
      publish(denyTopic, JSON.stringify({
        command: 'ACCESS_RESPONSE',
        status: 'DENIED',
        card_code: cardCodeString
      }));
      return;
    }

    // 2) Card exists — check permission records using card.id
    const permission = await prisma.permission.findFirst({
      where: {
        elevatorId: elevatorId,
        cardId: card.id
      }
    });

    // 3) Build response and log
    const responseTopic = `elevators/${elevatorId}/commands`; // publish on commands (device listens here)
    if (permission) {
      console.log(`Access GRANTED for card ${cardCodeString}. Relay: ${permission.relay}`);
      createLog("ACCESS_ATTEMPT", {
        cardCode: cardCodeString,
        status: "GRANTED",
        relayActivated: permission.relay
      }, elevatorId);

      const msg = {
        command: 'ACCESS_RESPONSE',
        status: 'GRANTED',
        card_code: cardCodeString,
        relay: permission.relay
      };
     // publish(responseTopic, JSON.stringify(msg));
    } else {
      console.log(`Access DENIED. Card ${cardCodeString} has no permission for elevator ${elevatorId}.`);
      createLog("ACCESS_ATTEMPT", {
        cardCode: cardCodeString,
        status: "DENIED",
        reason: "NO_PERMISSION"
      }, elevatorId);

      const msg = {
        command: 'ACCESS_RESPONSE',
        status: 'DENIED',
        card_code: cardCodeString
      };
      publish(responseTopic, JSON.stringify(msg));
    }
  } catch (error) {
    console.error("Error processing access event:", error);
    createLog("ACCESS_FAILURE", {
      cardCode: cardCodeString,
      error: error.message || 'unknown'
    }, elevatorId);
  }
};

// --- FUNCTION 2: Handles enrollment events ---
export const handleEnrollmentEvent = async (elevatorId, newCardCode) => {
  const newCardCodeString = newCardCode.toString();
  const state = getEnrollmentState(elevatorId);
  if (!state) {
    console.log(`ENROLLMENT: Ignoring event. Elevator ${elevatorId} was not in enrollment mode.`);
    return;
  }
  const { userId } = state;

  try {
    await prisma.card.create({ data: { code: newCardCodeString, userId: userId } });
    console.log(`SUCCESS: Card ${newCardCodeString} created and assigned to User ${userId}.`);
    createLog("ENROLLMENT_SUCCESS", {
      cardCode: newCardCodeString,
      assignedToUserId: userId,
      enrolledAtElevatorId: elevatorId
    });
    const topic = 'elevators/all/commands';
    const message = JSON.stringify({ command: "UPDATE_PERMISSIONS" });
    publish(topic, message);
  } catch (error) {
    console.error("ENROLLMENT FAILED:", error);
    createLog("ENROLLMENT_FAILURE", {
      cardCode: newCardCodeString,
      attemptedForUserId: userId,
      error: error.message
    });
  }
};
