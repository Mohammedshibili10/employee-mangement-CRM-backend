
import express from 'express';
import authMiddleware from '../middleware/authMiddleware.js';
import {
    getDepartments,
    createDepartment,
    updateDepartment,
    deleteDepartment,
} from '../controllers/departmentController.js';

const router = express.Router();

router.get('/', authMiddleware.protect, getDepartments);
router.post('/', authMiddleware.protect, createDepartment);
router.put('/:id', authMiddleware.protect, updateDepartment);
router.delete('/:id', authMiddleware.protect, deleteDepartment);

export default router;