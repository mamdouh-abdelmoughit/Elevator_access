// index.js

// --- FIX for BigInt ---
BigInt.prototype.toJSON = function() { return this.toString(); };

import express from 'express';
import { connect as connectMqtt } from './src/services/mqttService.js';
import { initializeEventListeners } from './src/events/eventListeners.js'; // <-- ADD THIS

// --- Import Routes ---
import userRoutes from './src/api/routes/userRoutes.js';
import elevatorRoutes from './src/api/routes/elevatorRoutes.js';
import cardRoutes from './src/api/routes/cardRoutes.js';
import permissionRoutes from './src/api/routes/permissionRoutes.js';
import enrollmentRoutes from './src/api/routes/enrollmentRoutes.js';
import logRoutes from './src/api/routes/logRoutes.js';

const app = express();

// --- Middleware & Routes ---
app.use(express.json());
app.use('/users', userRoutes);
app.use('/elevators', elevatorRoutes);
app.use('/cards', cardRoutes);
app.use('/permissions', permissionRoutes);
app.use('/enrollment', enrollmentRoutes);
app.use('/logs', logRoutes);
app.get('/', (req, res) => {
    res.send('Elevator Backend is running! (Decoupled structure)');
});

const PORT = 3000;
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
    connectMqtt();
    initializeEventListeners(); // <-- ADD THIS
});