import SalaryAdvance from "../models/SalaryAdvance.js";
import Employee from "../models/Employee.js";
import { recalcSalaryForMonth } from "./salaryController.js";

// Keep the salary report for an advance's month in sync — an advance is
// recovered from that month's pay, so the net changes the moment it is recorded.
const syncSalary = (employeeId, year, month) => recalcSalaryForMonth(employeeId, year, month);

const monthOf = (date) => new Date(date).getMonth() + 1;
const yearOf = (date) => new Date(date).getFullYear();

// Every advance recorded for a month, newest first — the history table.
export const getSalaryAdvances = async (req, res) => {
    try {
        const { month, year, employee } = req.query;
        if (!month || !year) {
            return res.status(400).json({ message: 'month and year are required' });
        }

        const filter = { month: Number(month), year: Number(year) };
        if (employee) filter.employee = employee;

        const advances = await SalaryAdvance.find(filter)
            .populate('employee', 'name empId')
            .sort({ date: -1, createdAt: -1 })
            .lean();

        const entries = advances
            // Skip any row whose employee record has since been removed.
            .filter((a) => a.employee)
            .map((a) => ({
                _id: a._id,
                employee: a.employee._id,
                employeeName: a.employee.name,
                empId: a.employee.empId,
                date: a.date,
                month: a.month,
                year: a.year,
                amount: a.amount,
                reason: a.reason || '',
                pardoned: !!a.pardoned,
            }));

        const total = entries.reduce((sum, e) => sum + (e.pardoned ? 0 : Number(e.amount) || 0), 0);

        return res.status(200).json({
            entries,
            total,
            month: Number(month),
            year: Number(year),
            message: 'Salary advances retrieved',
        });
    } catch (error) {
        return res.status(500).json({ message: 'Something went wrong', error: error.message });
    }
};

export const createSalaryAdvance = async (req, res) => {
    try {
        const { employee, date, amount, reason, month, year } = req.body;
        if (!employee || !date || amount == null) {
            return res.status(400).json({ message: 'Employee, date and amount are required' });
        }
        if (Number(amount) < 0) {
            return res.status(400).json({ message: 'Amount cannot be negative' });
        }

        const emp = await Employee.findById(employee);
        if (!emp) return res.status(404).json({ message: 'Employee not found' });

        const d = new Date(date);
        const m = Number(month) || monthOf(d);
        const y = Number(year) || yearOf(d);

        const record = await SalaryAdvance.create({
            employee, date: d, month: m, year: y,
            amount: Number(amount) || 0,
            reason: reason || '',
        });
        await syncSalary(employee, y, m);

        const populated = await SalaryAdvance.findById(record._id).populate('employee', 'name empId');
        return res.status(201).json({ message: 'Salary advance added', record: populated });
    } catch (error) {
        return res.status(500).json({ message: 'Something went wrong', error: error.message });
    }
};

export const updateSalaryAdvance = async (req, res) => {
    try {
        const { id } = req.params;
        const { employee, date, amount, reason, month, year, pardoned } = req.body;

        const record = await SalaryAdvance.findById(id);
        if (!record) return res.status(404).json({ message: 'Salary advance not found' });

        // Remember the old employee + period so both re-sync if they change.
        const prevEmployee = record.employee;
        const prevYear = record.year || yearOf(record.date);
        const prevMonth = record.month || monthOf(record.date);

        if (employee) record.employee = employee;
        if (date) record.date = new Date(date);
        if (amount !== undefined) record.amount = Number(amount) || 0;
        if (reason !== undefined) record.reason = reason;
        if (pardoned !== undefined) record.pardoned = Boolean(pardoned);
        record.month = Number(month) || monthOf(record.date);
        record.year = Number(year) || yearOf(record.date);
        await record.save();

        await syncSalary(prevEmployee, prevYear, prevMonth);
        await syncSalary(record.employee, record.year, record.month);

        const populated = await SalaryAdvance.findById(record._id).populate('employee', 'name empId');
        return res.status(200).json({ message: 'Salary advance updated', record: populated });
    } catch (error) {
        return res.status(500).json({ message: 'Something went wrong', error: error.message });
    }
};

export const deleteSalaryAdvance = async (req, res) => {
    try {
        const { id } = req.params;
        const record = await SalaryAdvance.findById(id);
        if (!record) return res.status(404).json({ message: 'Salary advance not found' });

        const { employee } = record;
        const y = record.year || yearOf(record.date);
        const m = record.month || monthOf(record.date);
        await record.deleteOne();
        await syncSalary(employee, y, m);

        return res.status(200).json({ message: 'Salary advance deleted' });
    } catch (error) {
        return res.status(500).json({ message: 'Something went wrong', error: error.message });
    }
};
