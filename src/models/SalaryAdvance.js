import mongoose from 'mongoose';
import { z } from 'zod';

export const salaryAdvanceSchema = z.object({
    employee: z.string().min(1, 'employee is required'),
    date: z.coerce.date(),
    month: z.number().int().min(1).max(12).optional(),
    year: z.number().int().optional(),
    amount: z.number().min(0, 'amount must be 0 or more'),
    reason: z.string().optional(),
});

// One advance paid out to an employee. Several can be recorded in a month; the
// payroll for that month deducts their total from the net pay.
const salaryAdvanceMongooseSchema = new mongoose.Schema({
    employee: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true },
    date: { type: Date, required: true },
    // Payroll period this advance is recovered from (1-12 / year).
    month: { type: Number },
    year: { type: Number },
    amount: { type: Number, required: true, default: 0, min: 0 },
    reason: { type: String, default: '' },
    // Waived advance: kept on record for reference but NOT deducted from pay.
    pardoned: { type: Boolean, default: false },
}, { timestamps: true });

export default mongoose.model('SalaryAdvance', salaryAdvanceMongooseSchema);
