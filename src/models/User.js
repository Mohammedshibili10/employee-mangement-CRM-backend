import mongoose from 'mongoose';
import { z } from 'zod';
const userSchema = z.object({
    name: z.string().min(2).max(100),
    email: z.string().email("invalid email format"),
    password: z.string().min(6, "password must be at least 6 characters"),
    role: z.enum(['admin', 'employee'])
});
export default mongoose.model('User', new mongoose.Schema(userSchema.shape, { timestamps: true }));
