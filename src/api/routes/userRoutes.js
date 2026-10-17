import express from 'express';
import {
  getAllUsers, createUser, createEmployee, updateUserLocation,
  loginUser, getManagers, downloadLocationLog, updateUser, savePushToken, deleteUser,
} from '../controllers/userController.js';
import auth from '../../middleware/auth.js';

const router = express.Router();

// Public
router.post('/login', loginUser);
router.post('/',      createUser);

// Protected
router.get('/',                          auth, getAllUsers);
router.get('/managers',                  auth, getManagers);
router.post('/employees',                auth, createEmployee);
router.post('/push-token',               auth, savePushToken);
router.post('/:id/location',             auth, updateUserLocation);
router.patch('/:id',                     auth, updateUser);
router.delete('/:id',                    auth, deleteUser);
router.get('/:id/location-log/download', auth, downloadLocationLog);

export default router;
