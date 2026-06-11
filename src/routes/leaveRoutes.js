import express from 'express';
import authMiddleware from '../middleware/authMiddleware.js';
import {
    getLeaves,
    applyLeave,
    approveLeave,
    rejectLeave,
} from '../controllers/leaveController.js';

const router = express.Router();

router.get('/', authMiddleware.protect, getLeaves);
router.post('/', authMiddleware.protect, applyLeave);
router.put('/:id/approve', authMiddleware.protect, approveLeave);
router.put('/:id/reject', authMiddleware.protect, rejectLeave);

export default router;
