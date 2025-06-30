import { Router } from 'express';
const router = Router();
import { getAllUsers, createUser } from '../controllers/userController.js';

router.get('/', getAllUsers);
router.post('/', createUser);

export default router;