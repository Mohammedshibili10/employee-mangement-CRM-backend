import mongoose from 'mongoose';
import { z } from 'zod';

export const holidaySchema = z.object({
    name: z.string().min(1, 'holiday name is required'),
    date: z.coerce.date(),
    description: z.string().optional(),
});

// A company holiday. Everyone is off and everyone is paid, exactly like a
// Sunday: the day is never attendance and never a loss of pay.
//
// This collection is the single source of truth. Payroll and the attendance
// views read it directly rather than writing an attendance record per employee,
// so a holiday added today covers employees who join tomorrow, and removing one
// leaves no orphaned records behind.
const holidayMongooseSchema = new mongoose.Schema({
    name: { type: String, required: true, trim: true },
    // Stored at local midnight so a whole calendar day is matched regardless of
    // what time of day it was entered.
    date: { type: Date, required: true },
    description: { type: String, default: '' },

    // A holiday is paid by default. An unpaid company shutdown can be recorded
    // by turning this off — the day is then a non-working day that earns nothing.
    paid: { type: Boolean, default: true },

    createdByName: { type: String, default: '' },
}, { timestamps: true });

// One holiday per date.
holidayMongooseSchema.index({ date: 1 }, { unique: true });

export default mongoose.model('Holiday', holidayMongooseSchema);
