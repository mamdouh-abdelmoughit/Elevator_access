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
export const updateUserLocation = async (req, res) => {
  try {
    const userId = parseInt(req.params.id);
    const { latitude, longitude } = req.body;

    if (latitude === undefined || longitude === undefined) {
      return res.status(400).json({ error: 'Latitude and longitude are required.' });
    }

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        latitude: parseFloat(latitude),
        longitude: parseFloat(longitude),
        locationUpdatedAt: new Date(), // Set the timestamp to now
      },
    });

    res.json(updatedUser);
  } catch (error) {
    console.error("Error updating user location:", error);
    res.status(500).json({ error: 'Could not update user location.' });
  }
};

export const updateUser = async (req, res) => {
    const userId = parseInt(req.params.id);
    const { name, email, isAdmin, isEmployee } = req.body;
    try {
        const updatedUser = await prisma.user.update({
            where: { id: userId },
            data: { name, email, isAdmin, isEmployee },
        });
        res.json(updatedUser);
    } catch (error) {
        res.status(500).json({ error: 'Could not update user.' });
    }
};