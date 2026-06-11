import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import User from './models/User.js';

dotenv.config();

const ADMIN = {
    name: 'Admin',
    email: 'admin@gmail.com',
    password: 'admin123',
    role: 'admin'
};

const seedAdmin = async () => {
    try {

        await mongoose.connect(process.env.MONGO_URI);
        console.log('MongoDB connected');

        const existingAdmin = await User.findOne({ email: ADMIN.email });
        if (existingAdmin) {
            console.log('Admin user already exists. Nothing to do.');
            return;
        }

        const hashedPassword = await bcrypt.hash(ADMIN.password, 10);

        await User.create({
            name: ADMIN.name,
            email: ADMIN.email,
            password: hashedPassword,
            role: ADMIN.role
        });

        console.log('Admin user created successfully');
    } catch (error) {
        console.error('Failed to seed admin user:', error.message);
    } finally {

        await mongoose.connection.close();
        process.exit();
    }
};

seedAdmin();
