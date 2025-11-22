import { Router } from 'express';
const router = Router();
import { createPermission, deletePermission ,getPermissionsForElevator } from '../controllers/permissionController.js';

router.post('/', createPermission);
router.post('/delete/:id', deletePermission);
router.get('/elevator/:id', getPermissionsForElevator);

export default router;