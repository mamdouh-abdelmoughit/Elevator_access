import { Router } from 'express';
const router = Router();
import { createCard } from '../controllers/cardController.js';

router.post('/', createCard);

export default router;