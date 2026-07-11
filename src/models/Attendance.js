import mongoose from 'mongoose';
import { z } from 'zod';

export const attendanceSchema = z.object({

    employee: z.string().min(1, "employee is required"),

    date: z.coerce.date(),

    checkIn: z.coerce.date().optional(),
    checkOut: z.coerce.date().optional(),

    status: z.enum(['present', 'absent', 'late', 'half-day', 'leave', 'wfh']),
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
    status: { type: String, enum: ['present', 'absent', 'late', 'half-day', 'leave', 'wfh'], required: true },
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
    // Pardoned LOP: kept for reference but not deducted from pay.
    lopPardoned: { type: Boolean, default: false },

    // Pardoned WFH: kept for reference but WFH deduction is waived
    wfhPardoned: { type: Boolean, default: false }
}, { timestamps: true });

export default mongoose.model('Attendance', attendanceMongooseSchema);
