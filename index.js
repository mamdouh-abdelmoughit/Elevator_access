// index.js
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';

import userRoutes from './src/api/routes/userRoutes.js';
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

// Middleware
app.use(cors());
app.use(bodyParser.json({ limit: '2mb' }));

// Health
app.get('/health', (req, res) => res.json({ status: 'UP', timestamp: new Date().toISOString() }));

app.use((req, res, next) => {
    console.log(`📢 LOG: ${req.method} request to: ${req.url}`);
    next();
});
// Public routes
app.use('/users', userRoutes); // login / signup are under here (public)
app.use('/cards', cardRoutes); // creating cards may be admin only, but left as-is for now

// Protected routes (require JWT)
app.use('/permissions', permissionRoutes);
app.use('/elevators', elevatorRoutes); // elevatorRoutes should check roles for some endpoints
app.use('/enrollment', auth, enrollmentRoutes);
app.use('/logs', auth, logRoutes);
app.use('/requests', auth, requestRoutes); 

// Generic error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal Server Error' });
});

app.listen(PORT, async () => {
  console.log(`HTTP server listening on port ${PORT}`);

  // start MQTT and event listeners
  await mqttConnect();
  initializeEventListeners();
});
