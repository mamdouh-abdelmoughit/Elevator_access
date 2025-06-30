import prisma from '../../db/prismaClient.js';

export async function createElevator(req, res) {
    try {
        const { name, location } = req.body;
        const newElevator = await prisma.elevator.create({ data: { name, location } });
        res.status(201).json(newElevator);
    } catch (error) {
        console.error("Error creating elevator:", error); 
        res.status(500).json({ error: 'Could not create elevator.' });
    }
}