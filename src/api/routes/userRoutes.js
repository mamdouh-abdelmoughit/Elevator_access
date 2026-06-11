import express from 'express';
import { getAllUsers, createUser, createEmployee, updateUserLocation, loginUser, getManagers } from '../controllers/userController.js';
import auth from '../../middleware/auth.js';

const router = express.Router();

// Public
router.post('/login', loginUser);
router.post('/',      createUser); // syndic self-registration (MANAGER only)

// Protected — require valid JWT
router.get('/',              auth, getAllUsers);
router.get('/managers',      auth, getManagers);
router.post('/employees',    auth, createEmployee); // manager creates technician account
router.post('/:id/location', auth, updateUserLocation);

export default router;
