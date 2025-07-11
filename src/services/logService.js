// src/services/logService.js
import prisma from '../db/prismaClient.js';

/**
 * Creates a log entry in the database.
 * @param {string} eventType - The type of event (e.g., "ACCESS_ATTEMPT", "ENROLLMENT").
 * @param {object} details - A JSON object with relevant details about the event.
 */
export const createLog = async (eventType, details) => {
  try {
    await prisma.log.create({
      data: {
        eventType: eventType,
        details: details, // Prisma automatically handles the JSON conversion
      },
    });
    console.log(`LOG: Event '${eventType}' logged successfully.`);
  } catch (error) {
    console.error("Failed to write to log:", error);
  }
};