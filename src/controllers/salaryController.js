import SalaryReport from "../models/SalaryReport.js";
import Employee from "../models/Employee.js";
import Attendance from "../models/Attendance.js";
import LopRecord from "../models/LopRecord.js";

// Sum the recorded LOP (Loss of Pay) days for an employee in a given month.
async function readLopDays(employeeId, year, month) {
    const start = new Date(year, month - 1, 1, 0, 0, 0, 0);
    const end = new Date(year, month, 0, 23, 59, 59, 999);
    const records = await LopRecord.find({ employee: employeeId, date: { $gte: start, $lte: end } });
    return records.reduce((sum, r) => sum + (Number(r.days) || 0), 0);
}

// ---- calculation helpers ----------------------------------------------------

// Number of weekdays (Mon–Fri) in a given month — used as monthly working days.
function countWorkingDays(year, month) {
    const totalDays = new Date(year, month, 0).getDate(); // month is 1-12
    let count = 0;
    for (let d = 1; d <= totalDays; d++) {
        const wd = new Date(year, month - 1, d).getDay();
        if (wd !== 0 && wd !== 6) count++;
    }
    return count;
}

const round = (n) => Math.round(n || 0);
// Round to 1 decimal place (used for amounts that can be fractional).
const round1 = (n) => Math.round((n || 0) * 10) / 10;
// Round to 2 decimal places.
const round2 = (n) => Math.round((n || 0) * 100) / 100;

// Paid-leave policy: up to 1 sick + 1 casual paid leave per month (2 total).
// Any leave taken beyond these caps is unpaid and counts as LOP.
const SICK_LEAVE_CAP = 1;
const CASUAL_LEAVE_CAP = 1;
const paidLeaveOf = (sick, casual) =>
    Math.min(sick || 0, SICK_LEAVE_CAP) + Math.min(casual || 0, CASUAL_LEAVE_CAP);

// Late-arrival deduction policy — minutes late after 9:00 AM:
//   <= 40 min  -> warning only, no deduction (0)
//   41-60 min  -> 0.25 of a day's pay
//   61-90 min  -> 0.50 of a day's pay
//   > 90 min   -> 1.00 (a full day's pay)
function lateFractionFor(checkIn) {
    if (!checkIn) return 0;
    const d = new Date(checkIn);
    const lateMin = (d.getHours() * 60 + d.getMinutes()) - 9 * 60;
    if (lateMin > 90) return 1;
    if (lateMin > 60) return 0.5;
    if (lateMin > 40) return 0.25;
    return 0;
}

// Read attendance for the month: attended days, paid leave days (sick/casual),
// and the total late-deduction fraction from check-in times.
async function readAttendance(employeeId, year, month) {
    const start = new Date(year, month - 1, 1, 0, 0, 0, 0);
    const end = new Date(year, month, 0, 23, 59, 59, 999);
    const records = await Attendance.find({
        employee: employeeId,
        date: { $gte: start, $lte: end },
    });
    let attendanceDays = 0, sickLeaveDays = 0, casualLeaveDays = 0, lateFraction = 0;
    for (const r of records) {
        if (r.status === 'present' || r.status === 'late' || r.status === 'half-day') {
            attendanceDays += 1;
            lateFraction += lateFractionFor(r.checkIn);
        } else if (r.status === 'leave') {
            if (r.leaveType === 'sick') sickLeaveDays += 1;
            else if (r.leaveType === 'casual') casualLeaveDays += 1;
        }
    }
    return { attendanceDays, sickLeaveDays, casualLeaveDays, lateFraction };
}

// Pure earnings math from attendance figures (no DB access) so it can be reused
// both when generating from real attendance and when an admin overrides the
// working days / attendance days in the salary breakdown.
// Salary split: Basic 50% & HRA 20% of gross; LTA is 10% of Basic Pay;
// Special Allowance is whatever is left of gross.
// Sick/Casual leave are PAID and excluded from LOP. LOP = working days with no
// attendance and no approved leave (unapproved absences) — deducted from pay.
function deriveEarnings({ monthlySalary, workingDays, attendanceDays, sickLeaveDays, casualLeaveDays, lateFraction = 0, lopDays = 0 }) {
    // Gross Salary = ROUND((Salary / Monthly Days) * Attendance, 1)
    // Pay is prorated by attendance: a full day's pay (salary / working days)
    // multiplied by the number of days actually attended, rounded to 1 decimal.
    const grossSalary = workingDays > 0 ? round1((monthlySalary / workingDays) * attendanceDays) : 0;
    const basicPay = round(grossSalary * 0.5);
    const hra = round(grossSalary * 0.2);
    // LTA = ROUND(Basic Pay * 10 / 100, 2) — always 10% of Basic Pay.
    const lta = round2(basicPay * 0.1);
    const specialAllowance = round1(grossSalary - basicPay - hra - lta);

    // A full day's pay is based on the MONTHLY salary (not the already
    // attendance-prorated gross) — otherwise Actual Pay is prorated twice.
    const perDay = workingDays > 0 ? monthlySalary / workingDays : 0;
    // Only the first sick + first casual leave are paid; extra leaves are LOP.
    const paidLeaveDays = paidLeaveOf(sickLeaveDays, casualLeaveDays);
    const accounted = attendanceDays + paidLeaveDays;
    const paidDays = Math.min(workingDays, accounted);
    const lop = Math.max(0, workingDays - accounted);
    // Actual Pay = a full day's pay * days actually paid (attendance + paid leave).
    const actualPay = round(perDay * paidDays);
    const lateDeduction = round(lateFraction * perDay);
    // Recorded LOP (from the LOP module) is deducted at a full day's pay per LOP day.
    const recordedLopDays = Number(lopDays) || 0;
    const lopDeduction = round(perDay * recordedLopDays);

    return {
        monthlyWorkingDays: workingDays,
        attendanceDays,
        sickLeaveDays,
        casualLeaveDays,
        paidLeaveDays,
        lop,
        monthlySalary,
        grossSalary,
        basicPay,
        hra,
        lta,
        specialAllowance,
        actualPay,
        lateDeduction,
        lopDays: recordedLopDays,
        lopDeduction,
    };
}

// Compute all attendance-derived + earnings fields for one employee by reading
// their real attendance for the month.
async function computeSalary(employee, year, month, workingDays) {
    const { attendanceDays, sickLeaveDays, casualLeaveDays, lateFraction } =
        await readAttendance(employee._id, year, month);
    const lopDays = await readLopDays(employee._id, year, month);

    return deriveEarnings({
        monthlySalary: employee.salary || 0,
        workingDays,
        attendanceDays,
        sickLeaveDays,
        casualLeaveDays,
        lateFraction,
        lopDays,
    });
}

function computeNetPay(r) {
    const deductions =
        (r.lopDeduction || 0) + (r.lateDeduction || 0) + (r.salaryAdvance || 0) +
        (r.wfhDeduction || 0) + (r.officeExpenses || 0) + (r.assetDeduction || 0);
    return round((r.actualPay || 0) - deductions);
}

// ---- controllers ------------------------------------------------------------

// Generate salary reports for a month. Skips employees who already have one
// (duplicate prevention) and returns the skipped list so the UI can warn.
export const generateSalary = async (req, res) => {
    try {
        const month = Number(req.body.month);
        const year = Number(req.body.year);
        const { department } = req.body;

        if (!month || month < 1 || month > 12 || !year) {
            return res.status(400).json({ message: 'Valid month and year are required' });
        }

        const empFilter = {};
        if (department) empFilter.department = department;
        const employees = await Employee.find(empFilter).populate('department');

        const workingDays = countWorkingDays(year, month);

        let created = 0;
        const skipped = [];

        for (const emp of employees) {
            const existing = await SalaryReport.findOne({ employee: emp._id, month, year });
            if (existing) {
                skipped.push({ empId: emp.empId, name: emp.name });
                continue;
            }
            const calc = await computeSalary(emp, year, month, workingDays);
            const doc = {
                ...calc,
                employee: emp._id,
                empId: emp.empId,
                employeeName: emp.name,
                department: emp.department?._id,
                departmentName: emp.department?.name || '',
                month,
                year,
                salaryAdvance: 0,
                wfhDeduction: 0,
                officeExpenses: 0,
                assetDeduction: 0,
            };
            doc.netPay = computeNetPay(doc);
            await SalaryReport.create(doc);
            created += 1;
        }

        return res.status(201).json({
            message: `Generated ${created} salary report(s).`,
            created,
            skipped,
            totalEmployees: employees.length,
        });
    } catch (error) {
        return res.status(500).json({ message: 'Something went wrong', error: error.message });
    }
};

export const getSalaryReports = async (req, res) => {
    try {
        const { month, year, employee, department } = req.query;
        const filter = {};
        if (month) filter.month = Number(month);
        if (year) filter.year = Number(year);
        if (employee) filter.employee = employee;
        if (department) filter.department = department;

        const reports = await SalaryReport.find(filter).sort({ createdAt: -1 });
        return res.status(200).json({ reports, message: 'Salary reports retrieved successfully' });
    } catch (error) {
        return res.status(500).json({ message: 'Something went wrong', error: error.message });
    }
};

// Update deductions / status, and optionally recalculate from attendance.
export const updateSalaryReport = async (req, res) => {
    try {
        const { id } = req.params;
        const {
            monthlyWorkingDays, attendanceDays, lateDeduction, salaryAdvance, wfhDeduction,
            officeExpenses, assetDeduction, status, recalculate,
        } = req.body;

        const report = await SalaryReport.findById(id);
        if (!report) return res.status(404).json({ message: 'Salary report not found' });

        if (recalculate) {
            const employee = await Employee.findById(report.employee);
            if (employee) {
                const workingDays = countWorkingDays(report.year, report.month);
                const calc = await computeSalary(employee, report.year, report.month, workingDays);
                Object.assign(report, calc);
            }
        }

        // Admin can override the working days and/or attendance days; gross salary,
        // the earnings split, LOP and pay all recompute from them via the same
        // formula used at generation time. The manually-managed late deduction is
        // preserved (we don't store the underlying late fraction here).
        if (monthlyWorkingDays !== undefined || attendanceDays !== undefined) {
            const wd = monthlyWorkingDays !== undefined ? (Number(monthlyWorkingDays) || 0) : (report.monthlyWorkingDays || 0);
            const att = attendanceDays !== undefined ? (Number(attendanceDays) || 0) : (report.attendanceDays || 0);
            const { lateDeduction: _preserved, ...earnings } = deriveEarnings({
                monthlySalary: report.monthlySalary || 0,
                workingDays: wd,
                attendanceDays: att,
                sickLeaveDays: report.sickLeaveDays || 0,
                casualLeaveDays: report.casualLeaveDays || 0,
                lopDays: report.lopDays || 0,
            });
            Object.assign(report, earnings);
        }

        if (lateDeduction !== undefined) report.lateDeduction = Number(lateDeduction) || 0;
        if (salaryAdvance !== undefined) report.salaryAdvance = Number(salaryAdvance) || 0;
        if (wfhDeduction !== undefined) report.wfhDeduction = Number(wfhDeduction) || 0;
        if (officeExpenses !== undefined) report.officeExpenses = Number(officeExpenses) || 0;
        if (assetDeduction !== undefined) report.assetDeduction = Number(assetDeduction) || 0;
        if (status && ['pending', 'paid'].includes(status)) report.status = status;

        report.netPay = computeNetPay(report);
        await report.save();

        return res.status(200).json({ message: 'Salary report updated successfully', report });
    } catch (error) {
        return res.status(500).json({ message: 'Something went wrong', error: error.message });
    }
};

// Recompute an existing salary report after its attendance/leave changes.
// Called from the attendance controller so salary stays in sync automatically.
export const recalcSalaryForMonth = async (employeeId, year, month) => {
    try {
        const report = await SalaryReport.findOne({ employee: employeeId, month, year });
        if (!report) return;
        const employee = await Employee.findById(employeeId);
        if (!employee) return;
        const workingDays = report.monthlyWorkingDays || countWorkingDays(year, month);
        const calc = await computeSalary(employee, year, month, workingDays);
        Object.assign(report, calc);
        report.netPay = computeNetPay(report);
        await report.save();
    } catch (e) {
        console.error('recalcSalaryForMonth failed:', e.message);
    }
};
