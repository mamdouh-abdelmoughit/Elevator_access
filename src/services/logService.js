import prisma from '../db/prismaClient.js';

export const createLog = async (eventType, details, elevatorId = null) => {
  try {
    await prisma.log.create({
      data: {
        eventType,
        details,
        ...(elevatorId !== null && { elevatorId }),
      },
    });
  } catch (error) {
    console.error("Failed to write to log:", error);
  }
};
