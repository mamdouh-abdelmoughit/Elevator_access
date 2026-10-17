import express from 'express';
import { getLogs, exportStateLogs, getAccessLogs, getActivity } from '../controllers/logController.js';

const router = express.Router();

router.get('/', getLogs);
router.get('/elevator/:id/export', exportStateLogs);
router.get('/elevator/:id/access', getAccessLogs);
router.get('/elevator/:id/activity', getActivity);

export default router;
