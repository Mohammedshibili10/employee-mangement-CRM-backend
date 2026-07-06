// import mongoose from 'mongoose';
// import bcrypt from 'bcryptjs';
// import dotenv from 'dotenv';
// import User from './models/User.js';

// dotenv.config();

// const ADMIN = {
//     name: 'HR',
//     email: 'hr@racstartup.com',
//     password: 'hr@1234',
//     role: 'admin'
// };

// const seedAdmin = async () => {
//     try {

//         await mongoose.connect(process.env.MONGO_URI);
//         console.log('MongoDB connected');

//         const hashedPassword = await bcrypt.hash(ADMIN.password, 10);

//         const existingAdmin = await User.findOne({ email: ADMIN.email });
//         if (existingAdmin) {
//             // Reset name/password/role to the seed values so re-running the seed
//             // reliably fixes the login (not just on first-time creation).
//             existingAdmin.name = ADMIN.name;
//             existingAdmin.password = hashedPassword;
//             existingAdmin.role = ADMIN.role;
//             await existingAdmin.save();
//             console.log(`Admin '${ADMIN.email}' already existed — password reset to the seed value.`);
//         } else {
//             await User.create({
//                 name: ADMIN.name,
//                 email: ADMIN.email,
//                 password: hashedPassword,
//                 role: ADMIN.role
//             });
//             console.log(`Admin '${ADMIN.email}' created successfully`);
//         }
//     } catch (error) {
//         console.error('Failed to seed admin user:', error.message);
//     } finally {

//         await mongoose.connection.close();
//         process.exit();
//     }
// };

// seedAdmin();
