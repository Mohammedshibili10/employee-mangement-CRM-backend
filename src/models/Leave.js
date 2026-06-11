
import mongoose from 'mongoose';
import { z } from 'zod';

export const leaveSchema = z.object({
    employee: z.string().min(1, "employee is required"),
    type: z.enum(['sick', 'casual', 'paid', 'unpaid']),
    from: z.coerce.date(),
    to: z.coerce.date(),
    reason: z.string().min(1, "reason is required"),
    status: z.enum(['pending', 'approved', 'rejected']).default('pending')
});

const leaveMongooseSchema = new mongoose.Schema({
    employee: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true },
    type: { type: String, enum: ['sick', 'casual', 'paid', 'unpaid'], required: true },
    from: { type: Date, required: true },
    to: { type: Date, required: true },
    reason: { type: String, required: true },
    status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' }
}, { timestamps: true });

export default mongoose.model('Leave', leaveMongooseSchema);
