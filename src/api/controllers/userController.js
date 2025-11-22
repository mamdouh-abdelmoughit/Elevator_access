// src/api/controllers/userController.js
import prisma from '../../db/prismaClient.js';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'devsecret';

// Get all users (admin only in practice — route is protected)
export async function getAllUsers(req, res) {
  try {
    const allUsers = await prisma.user.findMany({ include: { cards: true } });
    res.json(allUsers);
  } catch (error) {
    res.status(500).json({ error: 'Could not fetch users' });
  }
}

export const loginUser = async (req, res) => {
  try {
    const { phone, password } = req.body;
    if (!phone || !password) {
      return res.status(400).json({ error: "Phone and password are required." });
    }

    const user = await prisma.user.findUnique({ where: { phone } });
    if (!user) return res.status(404).json({ error: "Invalid phone number or password." });

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) return res.status(401).json({ error: "Invalid phone number or password." });

    const { password: _, ...userWithoutPassword } = user;

    const token = jwt.sign(
      { id: user.id, role: user.role },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({ token, user: userWithoutPassword });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ error: "An error occurred during login." });
  }
};

export const createUser = async (req, res) => {
  try {
    const { name, phone, password } = req.body;
    if (!name || !phone || !password) {
      return res.status(400).json({ error: "Name, phone, and password are required." });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: "Password must be at least 6 characters long." });
    }

    // Determine role (pilot rule) - phone '0661418895' becomes ADMIN
    const userRole = (phone === '0661418895') ? 'ADMIN' : 'EMPLOYEE';

    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    const newUser = await prisma.user.create({
      data: {
        name,
        phone,
        password: hashedPassword,
        role: userRole,
      },
    });

    const { password: _, ...userWithoutPassword } = newUser;
    res.status(201).json(userWithoutPassword);

  } catch (error) {
    console.error("Error creating user:", error);
    res.status(500).json({ error: 'Could not create user. Is the phone number unique?' });
  }
};

export const updateUserLocation = async (req, res) => {
  try {
    const userId = parseInt(req.params.id);
    const { latitude, longitude } = req.body;

    if (latitude === undefined || longitude === undefined) {
      return res.status(400).json({ error: 'Latitude and longitude are required.' });
    }

    // Optional: ensure only the user themselves or ADMIN can update
    if (req.user && req.user.id !== userId && req.user.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Not allowed' });
    }

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        latitude: parseFloat(latitude),
        longitude: parseFloat(longitude),
        locationUpdatedAt: new Date(),
      },
    });

    res.json(updatedUser);
  } catch (error) {
    console.error("Error updating user location:", error);
    res.status(500).json({ error: 'Could not update user location.' });
  }
};
