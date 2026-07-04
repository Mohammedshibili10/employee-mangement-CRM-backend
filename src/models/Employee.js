import mongoose from 'mongoose';
import { z } from 'zod';

export const employeeSchema = z.object({
    empId: z.string().min(1, "employee id is required"),
    name: z.string().min(2, "name must be at least 2 characters"),
    email: z.string().email("invalid email format"),
    phone: z.string().min(7, "invalid phone number"),
    department: z.string().min(1, "department is required"),
    designation: z.string().min(1, "designation is required"),
    salary: z.number().min(0, "salary must be a positive number").optional(),
    joiningDate: z.coerce.date(),
    status: z.enum(['active', 'inactive', 'terminated']).default('active'),
    profilePhoto: z.string().optional(),
    whatsappSent: z.boolean().default(false),
    onboarding: z.object({
        created: z.boolean().default(false),
        idGenerated: z.boolean().default(false),
        whatsappSent: z.boolean().default(false),
        firstLogin: z.boolean().default(false),
        profileCompleted: z.boolean().default(false)
    }).default({})
});

const employeeMongooseSchema = new mongoose.Schema({
    empId: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    phone: { type: String, required: true },
    department: { type: mongoose.Schema.Types.ObjectId, ref: 'Department', required: true },
    designation: { type: String, required: true },
    salary: { type: Number, default: 0 },
    joiningDate: { type: Date, required: true },
    status: { type: String, enum: ['active', 'inactive', 'terminated'], default: 'active' },
    profilePhoto: { type: String },
    whatsappSent: { type: Boolean, default: false },
    onboarding: {
        created: { type: Boolean, default: false },
        idGenerated: { type: Boolean, default: false },
        whatsappSent: { type: Boolean, default: false },
        firstLogin: { type: Boolean, default: false },
        profileCompleted: { type: Boolean, default: false }
    }
}, { timestamps: true });

export default mongoose.model('Employee', employeeMongooseSchema);
