import LopRecord from "../models/LopRecord.js";
import Employee from "../models/Employee.js";
import { recalcSalaryForMonth } from "./salaryController.js";

// Keep the salary report for a LOP record's month in sync (LOP deducts pay).
const syncSalary = (employeeId, date) => {
    const d = new Date(date);
    return recalcSalaryForMonth(employeeId, d.getFullYear(), d.getMonth() + 1);
};

const populateEmployee = { path: 'employee', select: 'name empId', populate: { path: 'department', select: 'name' } };

export const getLopRecords = async (req, res) => {
    try {
        const { employee, month, year } = req.query;
        const filter = {};
        if (employee) filter.employee = employee;
        if (month && year) {
            const m = Number(month), y = Number(year);
            filter.date = { $gte: new Date(y, m - 1, 1, 0, 0, 0, 0), $lte: new Date(y, m, 0, 23, 59, 59, 999) };
        }
        const records = await LopRecord.find(filter).populate(populateEmployee).sort({ date: -1 });
        return res.status(200).json({ records, message: 'LOP records retrieved successfully' });
    } catch (error) {
        return res.status(500).json({ message: 'Something went wrong', error: error.message });
    }
};

export const createLopRecord = async (req, res) => {
    try {
        const { employee, date, days, reason } = req.body;
        if (!employee || !date || days == null) {
            return res.status(400).json({ message: 'Employee, date and LOP days are required' });
        }
        const emp = await Employee.findById(employee);
        if (!emp) return res.status(404).json({ message: 'Employee not found' });

        const record = await LopRecord.create({
            employee,
            date: new Date(date),
            days: Number(days) || 0,
            reason: reason || '',
        });
        await syncSalary(employee, record.date);

        const populated = await LopRecord.findById(record._id).populate(populateEmployee);
        return res.status(201).json({ message: 'LOP record added', record: populated });
    } catch (error) {
        return res.status(500).json({ message: 'Something went wrong', error: error.message });
    }
};

export const updateLopRecord = async (req, res) => {
    try {
        const { id } = req.params;
        const { employee, date, days, reason } = req.body;

        const record = await LopRecord.findById(id);
        if (!record) return res.status(404).json({ message: 'LOP record not found' });

        // Remember the old employee/month so we can also re-sync it if they change.
        const prevEmployee = record.employee;
        const prevDate = record.date;

        if (employee) record.employee = employee;
        if (date) record.date = new Date(date);
        if (days !== undefined) record.days = Number(days) || 0;
        if (reason !== undefined) record.reason = reason;
        await record.save();

        await syncSalary(prevEmployee, prevDate);
        await syncSalary(record.employee, record.date);

        const populated = await LopRecord.findById(record._id).populate(populateEmployee);
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

        const { employee, date } = record;
        await record.deleteOne();
        await syncSalary(employee, date);

        return res.status(200).json({ message: 'LOP record deleted' });
    } catch (error) {
        return res.status(500).json({ message: 'Something went wrong', error: error.message });
    }
};

// Employee-centric LOP: list ALL employees with their basic details and their
// total LOP days for the selected month.
export const getLopSummary = async (req, res) => {
    try {
        const { month, year } = req.query;
        if (!month || !year) {
            return res.status(400).json({ message: 'month and year are required' });
        }
        const m = Number(month), y = Number(year);
        const start = new Date(y, m - 1, 1, 0, 0, 0, 0);
        const end = new Date(y, m, 0, 23, 59, 59, 999);

        const employees = await Employee.find().populate('department', 'name').sort({ name: 1 }).lean();
        const records = await LopRecord.find({ date: { $gte: start, $lte: end } }).lean();

        const totals = {};
        const reasons = {};
        records.forEach((r) => {
            const k = String(r.employee);
            totals[k] = (totals[k] || 0) + (Number(r.days) || 0);
            if (r.reason) reasons[k] = r.reason;
        });

        const list = employees.map((e) => ({
            _id: e._id,
            name: e.name,
            empId: e.empId,
            department: e.department?.name || '',
            designation: e.designation || '',
            salary: e.salary || 0,
            status: e.status,
            lopDays: totals[String(e._id)] || 0,
            reason: reasons[String(e._id)] || '',
        }));

        return res.status(200).json({ employees: list, month: m, year: y, message: 'LOP summary retrieved' });
    } catch (error) {
        return res.status(500).json({ message: 'Something went wrong', error: error.message });
    }
};

// Set an employee's total LOP days for a month (add / edit / increase / decrease).
// Keeps a single monthly LOP entry per employee and recalculates their salary.
export const setEmployeeLop = async (req, res) => {
    try {
        const { employee, month, year, days, reason } = req.body;
        if (!employee || !month || !year || days == null) {
            return res.status(400).json({ message: 'employee, month, year and days are required' });
        }
        const emp = await Employee.findById(employee);
        if (!emp) return res.status(404).json({ message: 'Employee not found' });

        const m = Number(month), y = Number(year);
        const value = Math.max(0, Number(days) || 0);
        const cleanReason = String(reason || '').slice(0, 200);
        const start = new Date(y, m - 1, 1, 0, 0, 0, 0);
        const end = new Date(y, m, 0, 23, 59, 59, 999);

        // Consolidate to a single monthly entry (with its reason) for this employee.
        await LopRecord.deleteMany({ employee, date: { $gte: start, $lte: end } });
        if (value > 0) {
            await LopRecord.create({ employee, date: new Date(y, m - 1, 1), days: value, reason: cleanReason });
        }
        await syncSalary(employee, new Date(y, m - 1, 1));

        return res.status(200).json({ employee, month: m, year: y, lopDays: value, reason: value > 0 ? cleanReason : '', message: 'LOP updated' });
    } catch (error) {
        return res.status(500).json({ message: 'Something went wrong', error: error.message });
    }
};
