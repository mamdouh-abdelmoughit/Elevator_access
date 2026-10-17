import prisma from '../db/prismaClient.js';

export const createLog = async (eventType, details, elevatorId = null, timestamp = null) => {
  try {
    await prisma.log.create({
      data: {
        eventType,
        details,
        ...(elevatorId !== null && { elevatorId }),
        ...(timestamp && { timestamp }),
      },
    });
  } catch (error) {
    console.error("Failed to write to log:", error);
  }
};
