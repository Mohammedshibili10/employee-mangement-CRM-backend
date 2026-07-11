import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Employee from './src/models/Employee.js';
import Attendance from './src/models/Attendance.js';
import SalaryReport from './src/models/SalaryReport.js';
import * as salaryController from './src/controllers/salaryController.js';

dotenv.config();

const testWfh = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        
        // Find an employee to test with
        const emp = await Employee.findOne({ salary: { $gt: 10000 } });
        console.log(`Testing with employee: ${emp.name}, Salary: ${emp.salary}`);
        
        // Delete all attendance for this employee in August 2026
        const start = new Date(2026, 7, 1);
        const end = new Date(2026, 8, 0, 23, 59, 59);
        await Attendance.deleteMany({ employee: emp._id, date: { $gte: start, $lte: end } });
        await SalaryReport.deleteMany({ employee: emp._id, month: 8, year: 2026 });
        
        // Create 2 "wfh" days, one pardoned, one unpardoned
        await Attendance.create({
            employee: emp._id,
            date: new Date(2026, 7, 10),
            status: 'wfh',
            wfhPardoned: false,
        });
        await Attendance.create({
            employee: emp._id,
            date: new Date(2026, 7, 11),
            status: 'wfh',
            wfhPardoned: true,
        });
        
        // Create 1 "present" day
        await Attendance.create({
            employee: emp._id,
            date: new Date(2026, 7, 12),
            status: 'present',
        });
        
        // Month has 31 days. AttendanceDays should be 3.
        // Unpardoned WFH days = 1.
        // So wfhDeduction should be 1 * (salary/31) * 0.5.
        
        const workingDays = 31;
        const perDay = emp.salary / workingDays;
        const expectedWfhDeduction = Math.round(perDay * 0.5 * 1);
        
        console.log(`Expected perDay: ${perDay.toFixed(2)}`);
        console.log(`Expected wfhDeduction: ${expectedWfhDeduction}`);
        
        await SalaryReport.create({
            employee: emp._id,
            empId: emp.empId,
            employeeName: emp.name,
            month: 8,
            year: 2026,
            monthlyWorkingDays: 31,
            attendanceDays: 0,
            monthlySalary: emp.salary,
            grossSalary: 0,
            actualPay: 0,
            netPay: 0
        });
        
        await salaryController.recalcSalaryForMonth(emp._id, 2026, 8);
        
        const report = await SalaryReport.findOne({ employee: emp._id, month: 8, year: 2026 });
        
        console.log(`\nGenerated Report:`);
        console.log(`Attendance Days: ${report.attendanceDays}`);
        console.log(`WFH Deduction: ${report.wfhDeduction}`);
        console.log(`Gross Salary: ${report.grossSalary}`);
        console.log(`Net Pay: ${report.netPay}`);
        
        if (report.wfhDeduction === expectedWfhDeduction) {
            console.log('\n✅ SUCCESS: WFH Deduction calculated correctly!');
        } else {
            console.log('\n❌ FAILURE: WFH Deduction incorrect!');
        }
        
    } catch (err) {
        console.error(err);
    } finally {
        await mongoose.connection.close();
    }
};

testWfh();
