
import express from 'express';
import authMiddleware from '../middleware/authMiddleware.js';
import {
    getEmployeeReport,
    getAttendanceReport,
    getLeaveReport,
} from '../controllers/reportController.js';

const router = express.Router();

router.get('/employees', authMiddleware.protect, getEmployeeReport);
router.get('/attendance', authMiddleware.protect, getAttendanceReport);
router.get('/leaves', authMiddleware.protect, getLeaveReport);

export default router;