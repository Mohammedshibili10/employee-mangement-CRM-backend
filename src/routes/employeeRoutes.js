import express from 'express';
import authMiddleware from '../middleware/authMiddleware.js';
import {
    getEmployees,
    createEmployee,
    getEmployee,
    updateEmployee,
    deleteEmployee,
    updateMyPhoto,
    deleteMyPhoto,
} from '../controllers/employeeController.js';

const router = express.Router();

router.get('/', authMiddleware.protect, authMiddleware.adminOnly, getEmployees);
router.post('/', authMiddleware.protect, authMiddleware.adminOnly, createEmployee);

// Employee-only: manage your OWN photo (role enforced in the controller).
router.put('/me/photo', authMiddleware.protect, updateMyPhoto);
router.delete('/me/photo', authMiddleware.protect, deleteMyPhoto);

router.get('/:id', authMiddleware.protect, authMiddleware.adminOnly, getEmployee);
router.put('/:id', authMiddleware.protect, authMiddleware.adminOnly, updateEmployee);
router.delete('/:id', authMiddleware.protect, authMiddleware.adminOnly, deleteEmployee);

export default router;
