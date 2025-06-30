// src/api/controllers/accessController.js
import prisma from '../../db/prismaClient.js';
import { publish } from '../../services/mqttService.js';

// This function handles the logic for a card swipe event
export async function handleAccessEvent(elevatorId, cardCode) {
    console.log(`Processing access request for Card [${cardCode}] at Elevator [${elevatorId}]`);

    try {
        // Find a permission that matches the card code AND the elevator ID
        const permission = await prisma.permission.findFirst({
            where: {
                elevatorId: elevatorId,
                card: {
                    code: cardCode
                }
            }
        });

        // Prepare the response topic and message
        const responseTopic = `elevators/${elevatorId}/access_response`;
        let responseMessage;

        if (permission) {
            // Access Granted!
            console.log(`Access GRANTED. Found permission rule. Relay: ${permission.relay}`);
            responseMessage = JSON.stringify({
                status: "GRANTED",
                card_code: cardCode.toString(),
                relay: permission.relay
            });
        } else {
            // Access Denied!
            console.log(`Access DENIED. No permission rule found for this card/elevator combo.`);
            responseMessage = JSON.stringify({
                status: "DENIED",
                card_code: cardCode.toString()
            });
        }

        // Publish the response back to the ESP32
        publish(responseTopic, responseMessage);

        // TODO: Log this access attempt to a new 'Log' table in the database

    } catch (error) {
        console.error("Error processing access event:", error);
    }
}