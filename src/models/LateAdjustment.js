import mongoose from 'mongoose';
import { z } from 'zod';

export const lateAdjustmentSchema = z.object({
    employee: z.string().min(1, 'employee is required'),
    month: z.number().int().min(1).max(12),
    year: z.number().int(),
    extraMinutes: z.number().int().min(0, 'minutes must be 0 or more'),
    reason: z.string().optional(),
});

// An admin's override of the LEFTOVER late minutes for one employee's month —
// the minutes that did not fill a complete 90-minute slab.
//
// It only ever replaces the remainder. The completed slabs come straight from
// attendance and are not editable here, so an adjustment can soften the tail of
// a month but can never wipe out lateness that has already cost full days.
//
// Kept in its own collection rather than on the salary report because a
// recalculation rewrites every attendance-derived field on that report; an
// override stored there would be silently erased the next time payroll ran.
const lateAdjustmentMongooseSchema = new mongoose.Schema({
    employee: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true },
    month: { type: Number, required: true },   // 1-12
    year: { type: Number, required: true },

    // The adjusted leftover minutes to charge on. Replaces the figure attendance
    // produced.
    extraMinutes: { type: Number, required: true, default: 0, min: 0 },
    // What attendance actually came to when the adjustment was made, so the
    // original is never lost.
    originalMinutes: { type: Number, default: 0 },

    reason: { type: String, default: '' },

    // Who made the adjustment and when.
    adjustedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    adjustedByName: { type: String, default: '' },
}, { timestamps: true });

// One adjustment per employee per payroll month.
lateAdjustmentMongooseSchema.index({ employee: 1, month: 1, year: 1 }, { unique: true });

export default mongoose.model('LateAdjustment', lateAdjustmentMongooseSchema);
