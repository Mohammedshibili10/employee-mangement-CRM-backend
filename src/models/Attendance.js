import mongoose from 'mongoose';
import { z } from 'zod';

export const attendanceSchema = z.object({

    employee: z.string().min(1, "employee is required"),

    date: z.coerce.date(),

    checkIn: z.coerce.date().optional(),
    checkOut: z.coerce.date().optional(),

    status: z.enum(['present', 'absent', 'late', 'half-day', 'leave', 'wfh', 'holiday', 'none']),
    leaveType: z.enum(['sick', 'casual']).optional(),

    latitude: z.number().optional(),
    longitude: z.number().optional(),
    image: z.string().optional(),

    lop: z.number().min(0).optional()
});

const attendanceMongooseSchema = new mongoose.Schema({
    employee: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true },
    date: { type: Date, required: true },
    checkIn: { type: Date },
    checkOut: { type: Date },
    // 'holiday' — a company holiday. Paid like a Sunday: never attendance,
    // never a loss of pay. Dates configured in Holiday Management apply to
    // everyone automatically; this status is for marking one-off cases.
    status: { type: String, enum: ['present', 'absent', 'late', 'half-day', 'leave', 'wfh', 'holiday', 'none'], required: true },
    leaveType: { type: String, enum: ['sick', 'casual'] },

    latitude: { type: Number },
    longitude: { type: Number },
    image: { type: String },

    checkOutLatitude: { type: Number },
    checkOutLongitude: { type: Number },
    checkOutImage: { type: String },

    overtime: { type: Boolean, default: false },
    overtimeMinutes: { type: Number, default: 0 },

    // Loss of Pay for the day (admin-entered when the LOP box is checked).
    lop: { type: Number, default: 0 },
    // Why the LOP was applied. Entered alongside it on the attendance form and
    // shown in the Deductions list, so a deduction is never unexplained.
    lopReason: { type: String, default: '' },
    // Pardoned LOP: kept for reference but not deducted from pay.
    lopPardoned: { type: Boolean, default: false },

    // Pardoned WFH: kept for reference but WFH deduction is waived
    wfhPardoned: { type: Boolean, default: false },

    // Pardoned late arrival: the day stays on record with its real check-in, but
    // the late-arrival deduction is waived. Who approved it and when are stored
    // alongside so the waiver is auditable.
    latePardoned: { type: Boolean, default: false },
    latePardonedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    latePardonedByName: { type: String, default: '' },
    latePardonedAt: { type: Date },

    // Set when Holiday Management turned an existing record into a holiday. It
    // holds the status the day had before, so removing the holiday puts the
    // record back exactly as it was rather than guessing.
    holidayPrevStatus: { type: String },

    // Where the record came from. Empty for anything entered through the app;
    // set to a batch name by a bulk import, so an import can be identified and
    // rolled back without touching the records the app created.
    source: { type: String }
}, { timestamps: true });

export default mongoose.model('Attendance', attendanceMongooseSchema);
