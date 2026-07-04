import mongoose from 'mongoose';
import { z } from 'zod';

export const lopRecordSchema = z.object({
    employee: z.string().min(1, 'employee is required'),
    date: z.coerce.date(),
    days: z.number().min(0, 'LOP days must be 0 or more'),
    reason: z.string().optional(),
});

const lopRecordMongooseSchema = new mongoose.Schema({
    employee: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true },
    date: { type: Date, required: true },
    // Number of Loss-of-Pay days (supports halves, e.g. 0.5).
    days: { type: Number, required: true, default: 1, min: 0 },
    reason: { type: String, default: '' },
}, { timestamps: true });

export default mongoose.model('LopRecord', lopRecordMongooseSchema);
