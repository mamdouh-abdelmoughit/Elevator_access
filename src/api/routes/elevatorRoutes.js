// src/api/routes/elevatorRoutes.js

import express from 'express';
// Add 'getNearbyEmployeesYou have' to this list
import { createElevator, getNearbyEmployees, getElevatorById} from '../controllers/elevatorController.js';

const router = express.Router();

router.get('/:id', getElevatorById);
router.post('/', createElevator);

// This line will now work correctly
router.get('/:id/nearby-employees', getNearbyEmployees);

export default router;