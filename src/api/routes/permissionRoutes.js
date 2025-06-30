import { Router } from 'express';
const router = Router();
import { createPermission, getPermissionsForElevator } from '../controllers/permissionController.js';

router.post('/', createPermission);
router.get('/elevator/:id', getPermissionsForElevator);

export default router;