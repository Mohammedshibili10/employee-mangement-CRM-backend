// Department model.
// Fields: name, head, employeeCount.
import mongoose from 'mongoose';
import { z } from 'zod';

export const departmentSchema = z.object({
    name: z.string().min(2, "Department name must be at least 2 characters"),
    head: z.string().min(1, "Department head is required"),
    employeeCount: z.number().int().min(0).default(0)
});

const departmentMongooseSchema = new mongoose.Schema({
    name: { type: String, required: true, unique: true },
    head: { type: String, required: true },
    employeeCount: { type: Number, default: 0 }
}, { timestamps: true });

export default mongoose.model('Department', departmentMongooseSchema);
