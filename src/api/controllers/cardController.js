import prisma from '../../db/prismaClient.js';

export async function createCard(req, res) {
    try {
        const { code, userId } = req.body;
        const newCard = await prisma.card.create({
            data: { code: BigInt(code), userId: userId }
        });
        res.status(201).json(newCard);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Could not create card. Is the code or userId unique?' });
    }
}