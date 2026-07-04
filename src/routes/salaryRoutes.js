import express from 'express';
import authMiddleware from '../middleware/authMiddleware.js';
import {
    generateSalary,
    getSalaryReports,
    updateSalaryReport,
} from '../controllers/salaryController.js';

const router = express.Router();

router.get('/', authMiddleware.protect, authMiddleware.adminOnly, getSalaryReports);
router.post('/generate', authMiddleware.protect, authMiddleware.adminOnly, generateSalary);
router.put('/:id', authMiddleware.protect, authMiddleware.adminOnly, updateSalaryReport);

export default router;
