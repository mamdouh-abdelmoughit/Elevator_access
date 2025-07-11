// src/api/routes/userRoutes.js

import express from 'express';
// Add 'updateUserLocation' to this list
import { getAllUsers, createUser, updateUserLocation , updateUser } from '../controllers/userController.js';

const router = express.Router();

router.get('/', getAllUsers);
router.post('/', createUser);
router.patch('/:id', updateUser);

// This line will now work correctly because the function has been imported
router.post('/:id/location', updateUserLocation);

export default router;