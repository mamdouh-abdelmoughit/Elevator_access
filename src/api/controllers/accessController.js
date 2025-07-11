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
        // Find a permission that matches the card code AND the elevator ID
        // The variable is now declared INSIDE the try block.
        const permission = await prisma.permission.findFirst({
            where: {
                elevatorId: elevatorId,
                card: {
                    code: cardCode
                }
            }
        });

        const responseTopic = `elevators/${elevatorId}/access_response`;
        let responseMessage;

        if (permission) {
            // Access Granted!
            console.log(`Access GRANTED. Found permission rule. Relay: ${permission.relay}`);
            responseMessage = JSON.stringify({
                status: "GRANTED",
                card_code: cardCodeString,
                relay: permission.relay
            });
            createLog("ACCESS_ATTEMPT", {
                cardCode: cardCodeString,
                elevatorId,
                status: "GRANTED",
                relayActivated: permission.relay
            });
        } else {
            // Access Denied!
            console.log(`Access DENIED. No permission rule found for card [${cardCodeString}].`);
            responseMessage = JSON.stringify({
                status: "DENIED",
                card_code: cardCodeString
            });
            createLog("ACCESS_ATTEMPT", {
                cardCode: cardCodeString,
                elevatorId,
                status: "DENIED"
            });
        }

        // Publish the response back to the ESP32
        publish(responseTopic, responseMessage);

    } catch (error) {
        // This block now handles any failure during the database query
        console.error("Error processing access event:", error);
        createLog("ACCESS_FAILURE", {
            cardCode: cardCodeString,
            elevatorId,
            error: "Database query failed."
        });
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
        await prisma.card.create({ data: { code: newCardCode, userId: userId } });
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