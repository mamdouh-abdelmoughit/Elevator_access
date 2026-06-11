import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';

import userRoutes from './src/api/routes/userRoutes.js';
import appRoutes from './src/api/routes/appRoutes.js';
import elevatorRoutes from './src/api/routes/elevatorRoutes.js';
import cardRoutes from './src/api/routes/cardRoutes.js';
import permissionRoutes from './src/api/routes/permissionRoutes.js';
import enrollmentRoutes from './src/api/routes/enrollmentRoutes.js';
import logRoutes from './src/api/routes/logRoutes.js';
import requestRoutes from './src/api/routes/requestRoutes.js';

import { connect as mqttConnect } from './src/services/mqttService.js';
import { initializeEventListeners } from './src/events/eventListeners.js';
import auth from './src/middleware/auth.js';

const PORT = process.env.PORT || 3000;
const app = express();

// ── Security headers ─────────────────────────────────────────────────────────
app.use(helmet());

// ── CORS ─────────────────────────────────────────────────────────────────────
app.use(cors());

// ── Body parsing (tight limit — no need for 2 MB) ────────────────────────────
app.use(express.json({ limit: '50kb' }));

// ── Rate limiters ─────────────────────────────────────────────────────────────
// Auth endpoints: 10 attempts per 15 min per IP
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts, please try again later.' },
});

// General API: 200 requests per minute per IP (covers all mobile app usage)
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests.' },
});

// ESP32 device endpoints: higher limit (devices poll frequently)
const deviceLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 600,
  standardHeaders: true,
  legacyHeaders: false,
});

// ── Apply rate limiters ───────────────────────────────────────────────────────
app.use('/users/login', authLimiter);
app.use('/users', apiLimiter);
app.use('/elevators/identify', deviceLimiter);
app.use('/permissions/elevator', deviceLimiter);

// ── Health (no auth, no rate limit — used by Cloud Run) ──────────────────────
app.get('/health', (req, res) => res.json({ status: 'UP', timestamp: new Date().toISOString() }));
app.use('/app', appRoutes);

app.use((req, res, next) => {
  console.log(`${req.method} ${req.url}`);
  next();
});

// ── Routes ───────────────────────────────────────────────────────────────────
app.use('/users',       userRoutes);
app.use('/cards',       cardRoutes);
app.use('/permissions', permissionRoutes);
app.use('/elevators',   elevatorRoutes);
app.use('/enrollment',  auth, enrollmentRoutes);
app.use('/logs',        auth, logRoutes);
app.use('/requests',    auth, requestRoutes);

// ── Error handler ─────────────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal Server Error' });
});

app.listen(PORT, '0.0.0.0', async () => {
  console.log(`Server listening on port ${PORT}`);
  await mqttConnect();
  initializeEventListeners();
});
