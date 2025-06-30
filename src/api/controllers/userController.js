import prisma from '../../db/prismaClient.js';

export async function getAllUsers(req, res) {
  try {
    const allUsers = await prisma.user.findMany({ include: { cards: true } });
    res.json(allUsers);
  } catch (error) {
    res.status(500).json({ error: 'Could not fetch users' });
  }
}

export async function createUser(req, res) {
  try {
    const { name, email } = req.body;
    const newUser = await prisma.user.create({ data: { name, email } });
    res.status(201).json(newUser);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Could not create user. Is the email unique?' });
  }
}