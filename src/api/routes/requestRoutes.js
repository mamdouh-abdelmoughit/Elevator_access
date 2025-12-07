import express from 'express';
import { 
    createRequest, 
    getPendingRequests, 
    getMyRequests, 
    updateRequestStatus 
} from '../controllers/requestController.js';

const router = express.Router();

// SYNDIC Routes
router.post('/', createRequest);        // POST /requests
router.get('/my', getMyRequests);       // GET /requests/my

// ADMIN Routes
router.get('/pending', getPendingRequests);    // GET /requests/pending
router.patch('/:id/status', updateRequestStatus); // PATCH /requests/1/status

export default router;