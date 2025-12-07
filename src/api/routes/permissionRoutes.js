import { Router } from 'express';
const router = Router();
import { createPermission, deletePermission ,getAllPermissionsForAdmin, 
    getPermissionsForDevice, getResidentsForSyndic ,
    togglePermissionStatus} from '../controllers/permissionController.js';

router.post('/', createPermission);
router.get('/elevator/:id/admin', getAllPermissionsForAdmin);
router.post('/delete/:id', deletePermission);
router.get('/elevator/:id', getPermissionsForDevice);
router.get('/elevator/:id/residents', getResidentsForSyndic); // <--- NEW ROUTE
router.patch('/:id/status', togglePermissionStatus);

export default router;