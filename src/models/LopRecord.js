import mongoose from 'mongoose';
import { z } from 'zod';

export const lopRecordSchema = z.object({
    employee: z.string().min(1, 'employee is required'),
    date: z.coerce.date(),
    month: z.number().int().min(1).max(12).optional(),
    year: z.number().int().optional(),
    days: z.number().min(0, 'LOP days must be 0 or more'),
    reason: z.string().optional(),
});

const lopRecordMongooseSchema = new mongoose.Schema({
    employee: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true },
    date: { type: Date, required: true },
    // Payroll period this LOP counts toward (1-12 / year).
    month: { type: Number },
    year: { type: Number },
    // Number of Loss-of-Pay days (supports halves, e.g. 0.5).
    days: { type: Number, required: true, default: 1, min: 0 },
    reason: { type: String, default: '' },
    // Pardoned LOP: kept on record (days/amount shown for reference) but NOT
    // deducted from pay.
    pardoned: { type: Boolean, default: false },
}, { timestamps: true });

export default mongoose.model('LopRecord', lopRecordMongooseSchema);
