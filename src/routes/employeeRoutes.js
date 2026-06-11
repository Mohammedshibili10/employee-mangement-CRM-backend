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

router.get('/', authMiddleware.protect, getEmployees);
router.post('/', authMiddleware.protect, createEmployee);

router.put('/me/photo', authMiddleware.protect, updateMyPhoto);
router.delete('/me/photo', authMiddleware.protect, deleteMyPhoto);

router.get('/:id', authMiddleware.protect, getEmployee);
router.put('/:id', authMiddleware.protect, updateEmployee);
router.delete('/:id', authMiddleware.protect, deleteEmployee);

export default router;
