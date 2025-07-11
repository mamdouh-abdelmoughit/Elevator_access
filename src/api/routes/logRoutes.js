// src/api/routes/logRoutes.js
import express from 'express';
import { getLogs } from '../controllers/logController.js';
const router = express.Router();

router.get('/', getLogs);

export default router;