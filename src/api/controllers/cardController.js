// src/api/controllers/cardController.js
import prisma from '../../db/prismaClient.js';

export async function createCard(req, res) {
  try {
    const { code, userId } = req.body;
    if (!code) return res.status(400).json({ error: 'code is required' });

    const newCard = await prisma.card.create({
      data: { code: code.toString(), userId: userId ? Number(userId) : null }
    });

    res.status(201).json(newCard);
  } catch (error) {
    console.error('createCard error:', error);
    res.status(500).json({ error: 'Could not create card. Is the code or userId unique?' });
  }
}

export async function getCardsForUser(req, res) {
  try {
    const userId = parseInt(req.params.userId);
    const cards = await prisma.card.findMany({ where: { userId } });
    res.json(cards);
  } catch (error) {
    console.error('getCardsForUser', error);
    res.status(500).json({ error: 'Could not fetch cards' });
  }
}
