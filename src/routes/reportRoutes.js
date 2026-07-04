import express from 'express';
import authMiddleware from '../middleware/authMiddleware.js';
import {
    getEmployeeReport,
    getAttendanceReport,
} from '../controllers/reportController.js';

const router = express.Router();

router.get('/employees', authMiddleware.protect, authMiddleware.adminOnly, getEmployeeReport);
router.get('/attendance', authMiddleware.protect, authMiddleware.adminOnly, getAttendanceReport);

export default router;
