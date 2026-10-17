// src/api/routes/elevatorRoutes.js

import express from 'express';
import { createElevator, getNearbyEmployees, getElevatorById, getAllElevators, sendCommand ,identifyElevator ,assignManager, getMyElevators,getElevatorWhitelist, toggleCardAccess} from '../controllers/elevatorController.js';
import {
  getOverview, updateSettings,
  listResidents, getResident, createResident, updateResident, deleteResident,
  startCardCapture, getRecentSwipes,
} from '../controllers/residentController.js';
import auth from '../../middleware/auth.js';
import deviceAuth from '../../middleware/deviceAuth.js';
const router = express.Router();

router.get('/', getAllElevators);
router.get('/my', auth, getMyElevators);
router.get('/identify', deviceAuth, identifyElevator);
router.get('/:id', getElevatorById);


router.use(auth);
router.post('/', createElevator);
router.post('/:id/command', sendCommand);
router.post('/:id/assign-manager', assignManager);
router.post('/:id/access-control', toggleCardAccess);

// Building configuration + residents (ADMIN or the elevator's Syndic)
router.get('/:id/overview', getOverview);
router.patch('/:id/settings', updateSettings);
router.get('/:id/residents', listResidents);
router.post('/:id/residents', createResident);
router.get('/:id/residents/:cardId', getResident);
router.patch('/:id/residents/:cardId', updateResident);
router.delete('/:id/residents/:cardId', deleteResident);
router.post('/:id/card-capture', startCardCapture);
router.get('/:id/swipes', getRecentSwipes);

router.get('/:id/nearby-employees', getNearbyEmployees);
router.get('/:id/whitelist', getElevatorWhitelist);

export default router;
