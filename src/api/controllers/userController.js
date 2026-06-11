import prisma from '../../db/prismaClient.js';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

const JWT_SECRET   = process.env.JWT_SECRET   || 'devsecret';
const ADMIN_PHONE  = process.env.ADMIN_PHONE;   // set in env — never hardcoded

// ── Helpers ───────────────────────────────────────────────────────────────────
const PHONE_RE = /^\+?[0-9]{7,15}$/;

function isValidPhone(phone) {
  return typeof phone === 'string' && PHONE_RE.test(phone.trim());
}

// ── GET /users  (admin only) ──────────────────────────────────────────────────
export async function getAllUsers(req, res) {
  if (req.user?.role !== 'ADMIN') {
    return res.status(403).json({ error: 'Admin access required.' });
  }
  try {
    const users = await prisma.user.findMany({
      select: { id: true, phone: true, name: true, role: true, createdAt: true }
    });
    res.json(users);
  } catch {
    res.status(500).json({ error: 'Could not fetch users.' });
  }
}

// ── POST /users/login ─────────────────────────────────────────────────────────
export const loginUser = async (req, res) => {
  try {
    const { phone, password } = req.body;

    if (!phone || !password) {
      return res.status(400).json({ error: 'Phone and password are required.' });
    }
    if (!isValidPhone(phone)) {
      return res.status(400).json({ error: 'Invalid phone format.' });
    }

    const user = await prisma.user.findUnique({ where: { phone: phone.trim() } });
    // Use constant-time comparison even when user not found to prevent timing attacks
    const dummyHash = '$2b$10$invalidhashfortimingatttacks00000000000000000000000000';
    const isValid = user
      ? await bcrypt.compare(password, user.password)
      : await bcrypt.compare(password, dummyHash).then(() => false);

    if (!user || !isValid) {
      return res.status(401).json({ error: 'Invalid phone number or password.' });
    }

    const { password: _, ...userWithoutPassword } = user;
    const token = jwt.sign(
      { id: user.id, role: user.role },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({ token, user: userWithoutPassword });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'An error occurred during login.' });
  }
};

// ── POST /users  (public — syndic self-registration, MANAGER role only) ───────
export const createUser = async (req, res) => {
  try {
    const { name, phone, password } = req.body;

    if (!name || !phone || !password) {
      return res.status(400).json({ error: 'Name, phone, and password are required.' });
    }
    if (typeof name !== 'string' || name.trim().length < 2 || name.trim().length > 100) {
      return res.status(400).json({ error: 'Name must be between 2 and 100 characters.' });
    }
    if (!isValidPhone(phone)) {
      return res.status(400).json({ error: 'Invalid phone number format.' });
    }
    if (typeof password !== 'string' || password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters.' });
    }

    // Public registration creates MANAGER (syndic) accounts only.
    // ADMIN is auto-assigned if the phone matches ADMIN_PHONE.
    let assignedRole = 'MANAGER';
    if (ADMIN_PHONE && phone.trim() === ADMIN_PHONE) {
      assignedRole = 'ADMIN';
    }

    const hashedPassword = await bcrypt.hash(password, 12);
    const newUser = await prisma.user.create({
      data: { name: name.trim(), phone: phone.trim(), password: hashedPassword, role: assignedRole },
    });

    const { password: _, ...userWithoutPassword } = newUser;
    res.status(201).json(userWithoutPassword);
  } catch (error) {
    if (error.code === 'P2002') {
      return res.status(409).json({ error: 'Phone number already registered.' });
    }
    console.error('Error creating user:', error);
    res.status(500).json({ error: 'Could not create user.' });
  }
};

// ── POST /users/employees  (ADMIN or MANAGER — creates technician accounts) ───
export const createEmployee = async (req, res) => {
  if (req.user?.role !== 'ADMIN' && req.user?.role !== 'MANAGER') {
    return res.status(403).json({ error: 'Only managers and admins can create technician accounts.' });
  }
  try {
    const { name, phone, password } = req.body;

    if (!name || !phone || !password) {
      return res.status(400).json({ error: 'Name, phone, and password are required.' });
    }
    if (typeof name !== 'string' || name.trim().length < 2 || name.trim().length > 100) {
      return res.status(400).json({ error: 'Name must be between 2 and 100 characters.' });
    }
    if (!isValidPhone(phone)) {
      return res.status(400).json({ error: 'Invalid phone number format.' });
    }
    if (typeof password !== 'string' || password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters.' });
    }

    const hashedPassword = await bcrypt.hash(password, 12);
    const newUser = await prisma.user.create({
      data: { name: name.trim(), phone: phone.trim(), password: hashedPassword, role: 'EMPLOYEE' },
    });

    const { password: _, ...userWithoutPassword } = newUser;
    res.status(201).json(userWithoutPassword);
  } catch (error) {
    if (error.code === 'P2002') {
      return res.status(409).json({ error: 'Phone number already registered.' });
    }
    console.error('Error creating employee:', error);
    res.status(500).json({ error: 'Could not create technician account.' });
  }
};

// ── POST /users/:id/location ──────────────────────────────────────────────────
export const updateUserLocation = async (req, res) => {
  try {
    const userId = parseInt(req.params.id);
    const { latitude, longitude } = req.body;

    if (isNaN(userId)) {
      return res.status(400).json({ error: 'Invalid user ID.' });
    }
    if (latitude === undefined || longitude === undefined) {
      return res.status(400).json({ error: 'Latitude and longitude are required.' });
    }

    const lat = parseFloat(latitude);
    const lon = parseFloat(longitude);
    if (isNaN(lat) || isNaN(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
      return res.status(400).json({ error: 'Invalid coordinates.' });
    }

    // Only the user themselves or an ADMIN can update location
    if (req.user.id !== userId && req.user.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Not authorized.' });
    }

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: { latitude: lat, longitude: lon, locationUpdatedAt: new Date() },
    });

    res.json({ id: updatedUser.id, latitude: updatedUser.latitude, longitude: updatedUser.longitude });
  } catch (error) {
    console.error('Error updating location:', error);
    res.status(500).json({ error: 'Could not update location.' });
  }
};

// ── GET /users/managers  (admin only) ─────────────────────────────────────────
export async function getManagers(req, res) {
  if (req.user?.role !== 'ADMIN') {
    return res.status(403).json({ error: 'Admin access required.' });
  }
  try {
    const managers = await prisma.user.findMany({
      where: { role: 'MANAGER' },
      select: { id: true, name: true, phone: true },
    });
    res.json(managers);
  } catch {
    res.status(500).json({ error: 'Could not fetch managers.' });
  }
}
