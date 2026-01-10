// src/api/routes/elevatorRoutes.js

import express from 'express';
// Add 'getNearbyEmployeesYou have' to this list
import { createElevator, getNearbyEmployees, getElevatorById, getAllElevators, sendCommand ,identifyElevator ,assignManager, getMyElevators,} from '../controllers/elevatorController.js';
import auth from '../../middleware/auth.js';
const router = express.Router();

router.get('/', getAllElevators);
router.get('/my', auth, getMyElevators); 
router.get('/identify', identifyElevator);
router.get('/:id', getElevatorById);


router.use(auth);
router.post('/', createElevator);
router.post('/:id/command', sendCommand);
router.post('/:id/assign-manager', assignManager);



// This line will now work correctly
router.get('/:id/nearby-employees', getNearbyEmployees);

export default router;