// src/api/routes/userRoutes.js

import express from 'express';
// Add 'updateUserLocation' to this list
import { getAllUsers, createUser, updateUserLocation, loginUser, getManagers } from '../controllers/userController.js';

const router = express.Router();

router.get('/', getAllUsers);
router.get('/managers', getManagers); 
router.post('/', createUser);
router.post('/login', loginUser);

// This line will now work correctly because the function has been imported
router.post('/:id/location', updateUserLocation);

export default router;