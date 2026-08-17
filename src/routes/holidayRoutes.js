import express from 'express';
import authMiddleware from '../middleware/authMiddleware.js';
import {
    getHolidays,
    createHoliday,
    updateHoliday,
    deleteHoliday,
    applyHoliday,
} from '../controllers/holidayController.js';

const router = express.Router();

// Everyone signed in can SEE the holiday calendar; only admins can change it.
router.get('/', authMiddleware.protect, getHolidays);
router.post('/', authMiddleware.protect, authMiddleware.adminOnly, createHoliday);
router.put('/:id', authMiddleware.protect, authMiddleware.adminOnly, updateHoliday);
router.post('/:id/apply', authMiddleware.protect, authMiddleware.adminOnly, applyHoliday);
router.delete('/:id', authMiddleware.protect, authMiddleware.adminOnly, deleteHoliday);

export default router;
