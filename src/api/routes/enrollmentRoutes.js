// src/api/routes/enrollmentRoutes.js

import express from 'express';
import { startEnrollment } from '../controllers/enrollmentController.js';

const router = express.Router();

// This defines the POST handler for the '/start' part of the URL
router.post('/start', startEnrollment);

export default router;