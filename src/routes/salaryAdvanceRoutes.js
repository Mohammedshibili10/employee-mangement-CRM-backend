import express from 'express';
import authMiddleware from '../middleware/authMiddleware.js';
import {
    getSalaryAdvances,
    createSalaryAdvance,
    updateSalaryAdvance,
    deleteSalaryAdvance,
} from '../controllers/salaryAdvanceController.js';

const router = express.Router();

router.get('/', authMiddleware.protect, authMiddleware.adminOnly, getSalaryAdvances);
router.post('/', authMiddleware.protect, authMiddleware.adminOnly, createSalaryAdvance);
router.put('/:id', authMiddleware.protect, authMiddleware.adminOnly, updateSalaryAdvance);
router.delete('/:id', authMiddleware.protect, authMiddleware.adminOnly, deleteSalaryAdvance);

export default router;
