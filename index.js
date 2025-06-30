
// --- FIX for BigInt JSON serialization ---
// This tells JSON.stringify how to handle BigInts
BigInt.prototype.toJSON = function() {       
    return this.toString();
};

// index.js
import express, { json } from 'express';
const app = express();
import mqttService from './src/services/mqttService.js'; // Import the MQTT service

// --- Middleware ---
app.use(json()); // To parse JSON bodies

// --- Import Routes ---
import userRoutes from './src/api/routes/userRoutes.js';
import elevatorRoutes from './src/api/routes/elevatorRoutes.js';
import cardRoutes from './src/api/routes/cardRoutes.js';
import permissionRoutes from './src/api/routes/permissionRoutes.js';

// --- Use Routes ---
// This tells Express that any route starting with /users should be handled by userRoutes
app.use('/users', userRoutes);
app.use('/elevators', elevatorRoutes);
app.use('/cards', cardRoutes);
app.use('/permissions', permissionRoutes);

// A test route for the root path
app.get('/', (req, res) => {
  res.send('Elevator Backend is running! (Modular structure)');
});

// --- Start the Server ---
const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
   mqttService.connect();
});