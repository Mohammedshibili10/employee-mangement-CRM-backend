import express from 'express';
import authMiddleware from '../middleware/authMiddleware.js';
import {
    getAttendance,
    markAttendance,
    updateAttendance,
    getAttendanceSummary,
    checkIn,
    checkOut,
} from '../controllers/attendanceController.js';

const router = express.Router();

router.get('/', authMiddleware.protect, getAttendance);

router.post('/', authMiddleware.protect, authMiddleware.adminOnly, markAttendance);

router.get('/summary', authMiddleware.protect, getAttendanceSummary);

router.post('/checkin', authMiddleware.protect, checkIn);

router.post('/checkout', authMiddleware.protect, checkOut);

router.put('/:id', authMiddleware.protect, authMiddleware.adminOnly, updateAttendance);

export default router;
