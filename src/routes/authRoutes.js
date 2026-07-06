import express from 'express';
import authMiddleware from '../middleware/authMiddleware.js';
import { login, logout, getMe, updateProfile, changePassword } from '../controllers/authController.js';

const router = express.Router();

router.post('/login', login);
router.post('/logout', logout);
router.get('/me', authMiddleware.protect, getMe);
router.put('/profile', authMiddleware.protect, updateProfile);
router.put('/change-password', authMiddleware.protect, changePassword);

export default router;
