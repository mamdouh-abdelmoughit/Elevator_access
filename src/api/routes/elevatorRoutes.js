import { Router } from 'express';
const router = Router();
import { createElevator } from '../controllers/elevatorController.js';

router.post('/', createElevator);

export default router;