import express from 'express';
import authMiddleware from '../middleware/authMiddleware.js';
import {
    getAttendance,
    markAttendance,
    getAttendanceSummary,
    checkIn,
    checkOut,
} from '../controllers/attendanceController.js';

const router = express.Router();

router.get('/', authMiddleware.protect, getAttendance);

router.post('/', authMiddleware.protect, markAttendance);

router.get('/summary', authMiddleware.protect, getAttendanceSummary);

router.post('/checkin', authMiddleware.protect, checkIn);

router.post('/checkout', authMiddleware.protect, checkOut);

export default router;
