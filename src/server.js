import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import connectDB from './config/db.js';
import errorMiddleware from './middleware/errorMiddleware.js';
import attendanceRoutes from './routes/attendanceRoutes.js';
import authRoutes from './routes/authRoutes.js';
import employeeRoutes from './routes/employeeRoutes.js';
import departmentRoutes from './routes/departmentRoutes.js';
import reportRoutes from './routes/reportRoutes.js';
import salaryRoutes from './routes/salaryRoutes.js';
import lopRoutes from './routes/lopRoutes.js';

dotenv.config();

const app= express();
const PORT = process.env.PORT || 5000;

app.use(express.json({ limit: '5mb' }));
app.use(cors());
app.use(errorMiddleware);

app.get('/',(req,res)=>{
    res.send('Employee Management CRM API is running');
})

app.use('/api/auth', authRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/employees', employeeRoutes);
app.use('/api/departments', departmentRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/salary', salaryRoutes);
app.use('/api/lop', lopRoutes);

app.listen(PORT,()=>{
    connectDB();
    console.log(`Server is running on port ${PORT}`);
})
