import express from 'express';
import authMiddleware from '../middleware/authMiddleware.js';
import {
    getDeductions,
    createLopRecord,
    updateLopRecord,
    deleteLopRecord,
} from '../controllers/lopController.js';

const router = express.Router();

// Employee-centric Deductions view (define before '/:id').
router.get('/deductions', authMiddleware.protect, authMiddleware.adminOnly, getDeductions);

router.post('/', authMiddleware.protect, authMiddleware.adminOnly, createLopRecord);
router.put('/:id', authMiddleware.protect, authMiddleware.adminOnly, updateLopRecord);
router.delete('/:id', authMiddleware.protect, authMiddleware.adminOnly, deleteLopRecord);

export default router;
