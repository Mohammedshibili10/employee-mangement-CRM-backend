import LopRecord from "../models/LopRecord.js";
import Employee from "../models/Employee.js";
import Attendance from "../models/Attendance.js";
import { recalcSalaryForMonth } from "./salaryController.js";

// Keep the salary report for a LOP record's month in sync (LOP deducts pay).
const syncSalary = (employeeId, year, month) => recalcSalaryForMonth(employeeId, year, month);

const monthOf = (date) => new Date(date).getMonth() + 1;
const yearOf = (date) => new Date(date).getFullYear();

// Flat Deductions list: one row per LOP entry for the month — combining MANUAL
// entries and ATTENDANCE-marked LOP (kept in sync automatically).
export const getDeductions = async (req, res) => {
    try {
        const { month, year } = req.query;
        if (!month || !year) {
            return res.status(400).json({ message: 'month and year are required' });
        }
        const m = Number(month), y = Number(year);
        const start = new Date(y, m - 1, 1, 0, 0, 0, 0);
        const end = new Date(y, m, 0, 23, 59, 59, 999);

        const employees = await Employee.find().select('name empId').lean();
        const empMap = {};
        employees.forEach((e) => { empMap[String(e._id)] = e; });

        const manual = await LopRecord.find({ month: m, year: y }).lean();
        // Attendance LOP: explicit LOP marks (lop > 0) AND unpaid absences (status 'absent').
        const attendance = await Attendance.find({
            date: { $gte: start, $lte: end },
            $or: [{ lop: { $gt: 0 } }, { status: 'absent' }],
        }).lean();

        const entries = [];
        manual.forEach((r) => {
            const e = empMap[String(r.employee)];
            if (!e) return;
            entries.push({
                _id: r._id, source: 'manual', employee: r.employee, employeeName: e.name, empId: e.empId,
                date: r.date, month: r.month || monthOf(r.date), year: r.year || yearOf(r.date),
                days: r.days, reason: r.reason || '', pardoned: !!r.pardoned,
            });
        });
        attendance.forEach((a) => {
            const e = empMap[String(a.employee)];
            if (!e) return;
            const base = { employee: a.employee, employeeName: e.name, empId: e.empId, date: a.date, month: monthOf(a.date), year: yearOf(a.date) };
            if (a.lop > 0) {
                // Explicit LOP marked in the Attendance module (drives the LOP deduction).
                entries.push({ ...base, _id: a._id, source: 'attendance', absence: false, days: a.lop, reason: 'Marked LOP in Attendance', pardoned: !!a.lopPardoned });
            } else {
                // Unpaid absence — a loss-of-pay day (reflected in Actual Pay, not double-deducted).
                entries.push({ ...base, _id: a._id, source: 'attendance', absence: true, days: 1, reason: 'Absent (unpaid)', pardoned: false });
            }
        });

        entries.sort((a, b) => new Date(b.date) - new Date(a.date));

        return res.status(200).json({ entries, month: m, year: y, message: 'Deductions retrieved' });
    } catch (error) {
        return res.status(500).json({ message: 'Something went wrong', error: error.message });
    }
};

export const createLopRecord = async (req, res) => {
    try {
        const { employee, date, days, reason, month, year } = req.body;
        if (!employee || !date || days == null) {
            return res.status(400).json({ message: 'Employee, date and LOP days are required' });
        }
        const emp = await Employee.findById(employee);
        if (!emp) return res.status(404).json({ message: 'Employee not found' });

        const d = new Date(date);
        const m = Number(month) || monthOf(d);
        const y = Number(year) || yearOf(d);

        const record = await LopRecord.create({
            employee, date: d, month: m, year: y,
            days: Number(days) || 0, reason: reason || '',
        });
        await syncSalary(employee, y, m);

        const populated = await LopRecord.findById(record._id).populate('employee', 'name empId');
        return res.status(201).json({ message: 'LOP record added', record: populated });
    } catch (error) {
        return res.status(500).json({ message: 'Something went wrong', error: error.message });
    }
};

export const updateLopRecord = async (req, res) => {
    try {
        const { id } = req.params;
        const { employee, date, days, reason, month, year, pardoned } = req.body;

        const record = await LopRecord.findById(id);
        if (!record) return res.status(404).json({ message: 'LOP record not found' });

        // Remember the old employee + payroll period so both re-sync if they change.
        const prevEmployee = record.employee;
        const prevYear = record.year || yearOf(record.date);
        const prevMonth = record.month || monthOf(record.date);

        if (employee) record.employee = employee;
        if (date) record.date = new Date(date);
        if (days !== undefined) record.days = Number(days) || 0;
        if (reason !== undefined) record.reason = reason;
        if (pardoned !== undefined) record.pardoned = Boolean(pardoned);
        record.month = Number(month) || monthOf(record.date);
        record.year = Number(year) || yearOf(record.date);
        await record.save();

        await syncSalary(prevEmployee, prevYear, prevMonth);
        await syncSalary(record.employee, record.year, record.month);

        const populated = await LopRecord.findById(record._id).populate('employee', 'name empId');
        return res.status(200).json({ message: 'LOP record updated', record: populated });
    } catch (error) {
        return res.status(500).json({ message: 'Something went wrong', error: error.message });
    }
};

export const deleteLopRecord = async (req, res) => {
    try {
        const { id } = req.params;
        const record = await LopRecord.findById(id);
        if (!record) return res.status(404).json({ message: 'LOP record not found' });

        const { employee } = record;
        const y = record.year || yearOf(record.date);
        const m = record.month || monthOf(record.date);
        await record.deleteOne();
        await syncSalary(employee, y, m);

        return res.status(200).json({ message: 'LOP record deleted' });
    } catch (error) {
        return res.status(500).json({ message: 'Something went wrong', error: error.message });
    }
};
