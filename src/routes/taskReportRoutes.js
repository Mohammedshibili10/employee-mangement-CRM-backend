import express from 'express';
import authMiddleware from '../middleware/authMiddleware.js';
import {
    getTaskReports,
    createTaskReport,
    verifyTaskReport,
} from '../controllers/taskReportController.js';

const router = express.Router();

router.get('/', authMiddleware.protect, getTaskReports);
router.post('/', authMiddleware.protect, createTaskReport);
router.put('/:id/verify', authMiddleware.protect, verifyTaskReport);

export default router;
