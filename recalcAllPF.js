import mongoose from 'mongoose';
import dotenv from 'dotenv';
import SalaryReport from './src/models/SalaryReport.js';
import * as salaryController from './src/controllers/salaryController.js';

dotenv.config();

const recalculateAll = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('MongoDB connected. Recalculating all July 2026 salary reports...');

        const reports = await SalaryReport.find({ month: 7, year: 2026 });
        
        let count = 0;
        for (const report of reports) {
            await salaryController.recalcSalaryForMonth(report.employee, 2026, 7);
            count++;
        }

        console.log(`Recalculated ${count} salary reports.`);
    } catch (err) {
        console.error('Error recalculating:', err.message);
    } finally {
        await mongoose.connection.close();
        process.exit();
    }
};

recalculateAll();
