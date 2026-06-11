import express from 'express';
import { getAppVersion } from '../controllers/appController.js';

const router = express.Router();

// Public — no auth needed, app checks this before login
router.get('/version', getAppVersion);

export default router;
