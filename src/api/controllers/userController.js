import prisma from '../../db/prismaClient.js';
import bcrypt from 'bcrypt'; 

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

        // 1. Find the user by their phone number
        const user = await prisma.user.findUnique({
            where: { phone: phone },
        });

        if (!user) {
            return res.status(404).json({ error: "Invalid phone number or password." });
        }

        // 2. Compare the provided password with the stored hash
        const isPasswordValid = await bcrypt.compare(password, user.password);

        if (!isPasswordValid) {
            return res.status(401).json({ error: "Invalid phone number or password." });
        }
        
        // 3. Login successful. Send user data back (without the password)
        const { password: _, ...userWithoutPassword } = user;
        res.json(userWithoutPassword);

    } catch (error) {
        console.error("Login error:", error);
        res.status(500).json({ error: "An error occurred during login." });
    }
};

export const createUser = async (req, res) => {
  try {
    // Now expecting name, phone, and password
    const { name, phone, password } = req.body;
    if (!name || !phone || !password) {
        return res.status(400).json({ error: "Name, phone, and password are required." });
    }
    if (password.length < 6) {
        return res.status(400).json({ error: "Password must be at least 6 characters long." });
    }

    // --- THE NEW LOGIC ---
    // 1. Determine the role based on the phone number
    const userRole = (phone === '0661418895') ? 'ADMIN' : 'EMPLOYEE';

    // 2. Hash the password for security
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    // 3. Create the user in the database
    const newUser = await prisma.user.create({
      data: {
        name: name,
        phone: phone,
        password: hashedPassword, // Store the HASHED password
        role: userRole,
      },
    });
    
    // Exclude password from the response for security
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