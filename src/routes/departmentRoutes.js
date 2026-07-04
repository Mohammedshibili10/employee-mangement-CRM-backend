import express from 'express';
import authMiddleware from '../middleware/authMiddleware.js';
import {
    getDepartments,
    createDepartment,
    updateDepartment,
    deleteDepartment,
} from '../controllers/departmentController.js';

const router = express.Router();

router.get('/', authMiddleware.protect, authMiddleware.adminOnly, getDepartments);
router.post('/', authMiddleware.protect, authMiddleware.adminOnly, createDepartment);
router.put('/:id', authMiddleware.protect, authMiddleware.adminOnly, updateDepartment);
router.delete('/:id', authMiddleware.protect, authMiddleware.adminOnly, deleteDepartment);

export default router;
