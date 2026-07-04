import express from 'express';
import authMiddleware from '../middleware/authMiddleware.js';
import {
    getLopRecords,
    createLopRecord,
    updateLopRecord,
    deleteLopRecord,
    getLopSummary,
    setEmployeeLop,
} from '../controllers/lopController.js';

const router = express.Router();

// Employee-centric endpoints (define before '/:id' so they aren't shadowed).
router.get('/summary', authMiddleware.protect, authMiddleware.adminOnly, getLopSummary);
router.put('/set', authMiddleware.protect, authMiddleware.adminOnly, setEmployeeLop);

router.get('/', authMiddleware.protect, authMiddleware.adminOnly, getLopRecords);
router.post('/', authMiddleware.protect, authMiddleware.adminOnly, createLopRecord);
router.put('/:id', authMiddleware.protect, authMiddleware.adminOnly, updateLopRecord);
router.delete('/:id', authMiddleware.protect, authMiddleware.adminOnly, deleteLopRecord);

export default router;
