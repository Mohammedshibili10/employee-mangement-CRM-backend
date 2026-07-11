import mongoose from 'mongoose';

const salaryReportSchema = new mongoose.Schema({
    // Reference + snapshots (so the report survives employee edits/deletes).
    employee: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true },
    empId: { type: String },
    employeeName: { type: String },
    department: { type: mongoose.Schema.Types.ObjectId, ref: 'Department' },
    departmentName: { type: String },

    month: { type: Number, required: true },  // 1-12
    year: { type: Number, required: true },

    // Attendance-derived
    monthlyWorkingDays: { type: Number, default: 0 },
    attendanceDays: { type: Number, default: 0 },
    sickLeaveDays: { type: Number, default: 0 },
    casualLeaveDays: { type: Number, default: 0 },
    paidLeaveDays: { type: Number, default: 0 },
    lop: { type: Number, default: 0 },

    // Earnings
    monthlySalary: { type: Number, default: 0 },
    grossSalary: { type: Number, default: 0 },
    basicPay: { type: Number, default: 0 },
    hra: { type: Number, default: 0 },
    lta: { type: Number, default: 0 },
    specialAllowance: { type: Number, default: 0 },
    actualPay: { type: Number, default: 0 },

    // Recorded LOP (from the LOP module) and its money value.
    lopDays: { type: Number, default: 0 },
    lopDeduction: { type: Number, default: 0 },

    // Deductions
    lateDeduction: { type: Number, default: 0 },
    salaryAdvance: { type: Number, default: 0 },
    wfhDeduction: { type: Number, default: 0 },
    officeExpenses: { type: Number, default: 0 },
    assetDeduction: { type: Number, default: 0 },
    pfDeduction: { type: Number, default: 0 },

    netPay: { type: Number, default: 0 },

    status: { type: String, enum: ['pending', 'paid'], default: 'pending' },
}, { timestamps: true });

// One salary report per employee per month/year — blocks duplicate generation.
salaryReportSchema.index({ employee: 1, month: 1, year: 1 }, { unique: true });

export default mongoose.model('SalaryReport', salaryReportSchema);
