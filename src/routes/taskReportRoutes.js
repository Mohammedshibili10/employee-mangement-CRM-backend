import express from 'express';
import authMiddleware from '../middleware/authMiddleware.js';
import {
    getTaskReports,
    createTaskReport,
} from '../controllers/taskReportController.js';

const router = express.Router();

router.get('/', authMiddleware.protect, getTaskReports);
router.post('/', authMiddleware.protect, createTaskReport);

export default router;
