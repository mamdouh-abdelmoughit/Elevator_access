// src/api/controllers/logController.js
import prisma from '../../db/prismaClient.js';

export const getLogs = async (req, res) => {
  try {
    // Fetch the most recent 50 logs, ordered by newest first
    const logs = await prisma.log.findMany({
      take: 50,
      orderBy: {
        timestamp: 'desc',
      },
    });
    res.json(logs);
  } catch (error) {
    console.error("Error fetching logs:", error);
    res.status(500).json({ error: 'Could not fetch logs.' });
  }
};