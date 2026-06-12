import mongoose from 'mongoose';
import { z } from 'zod';

export const taskReportSchema = z.object({
    employee: z.string().min(1, "employee is required"),
    title: z.string().min(1, "title is required"),
    description: z.string().min(1, "description is required"),
    date: z.coerce.date(),
    status: z.enum(['completed', 'in-progress', 'pending']).default('pending'),
    file: z.string().optional(),
    fileName: z.string().optional(),
    verified: z.boolean().default(false)
});

const taskReportMongooseSchema = new mongoose.Schema({
    employee: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true },
    title: { type: String, required: true },
    description: { type: String, required: true },
    date: { type: Date, required: true },
    status: { type: String, enum: ['completed', 'in-progress', 'pending'], default: 'pending' },

    // Optional attachment stored as a base64 data URL (matches how profile
    // photos and attendance selfies are stored in this project).
    file: { type: String },
    fileName: { type: String },

    // Admin verification of the report.
    verified: { type: Boolean, default: false },
    verifiedAt: { type: Date }
}, { timestamps: true });

export default mongoose.model('TaskReport', taskReportMongooseSchema);
