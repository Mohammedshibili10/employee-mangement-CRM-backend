import express from 'express';
import authMiddleware from '../middleware/authMiddleware.js';
import {
    getLateAdjustments,
    upsertLateAdjustment,
    deleteLateAdjustment,
    previewLateAdjustment,
} from '../controllers/lateAdjustmentController.js';

const router = express.Router();

router.get('/', authMiddleware.protect, authMiddleware.adminOnly, getLateAdjustments);
router.get('/preview', authMiddleware.protect, authMiddleware.adminOnly, previewLateAdjustment);
router.post('/', authMiddleware.protect, authMiddleware.adminOnly, upsertLateAdjustment);
router.delete('/:id', authMiddleware.protect, authMiddleware.adminOnly, deleteLateAdjustment);

export default router;
