import mongoose from 'mongoose';
import { z } from 'zod';

export const attendanceSchema = z.object({

    employee: z.string().min(1, "employee is required"),

    date: z.coerce.date(),

    checkIn: z.coerce.date().optional(),
    checkOut: z.coerce.date().optional(),

    status: z.enum(['present', 'absent', 'late', 'half-day', 'leave']),

    latitude: z.number().optional(),
    longitude: z.number().optional(),
    image: z.string().optional()
});

const attendanceMongooseSchema = new mongoose.Schema({
    employee: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true },
    date: { type: Date, required: true },
    checkIn: { type: Date },
    checkOut: { type: Date },
    status: { type: String, enum: ['present', 'absent', 'late', 'half-day', 'leave'], required: true },

    latitude: { type: Number },
    longitude: { type: Number },
    image: { type: String },

    checkOutLatitude: { type: Number },
    checkOutLongitude: { type: Number },
    checkOutImage: { type: String },

    overtime: { type: Boolean, default: false },
    overtimeMinutes: { type: Number, default: 0 }
}, { timestamps: true });

export default mongoose.model('Attendance', attendanceMongooseSchema);
