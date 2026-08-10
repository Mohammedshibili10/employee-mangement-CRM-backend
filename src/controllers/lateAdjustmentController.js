import LateAdjustment from "../models/LateAdjustment.js";
import Employee from "../models/Employee.js";
import SalaryReport from "../models/SalaryReport.js";
import User from "../models/User.js";
import { recalcSalaryForMonth } from "./salaryController.js";
import { splitLateMinutes, lateDeductionForMinutes } from "../utils/attendanceRules.js";

// Editing the leftover minutes changes the deduction, so payroll must follow.
const syncSalary = (employeeId, year, month) => recalcSalaryForMonth(employeeId, year, month);

// One row per employee for the month: the late minutes attendance produced, the
// completed 90-minute slabs (fixed), and the leftover minutes an admin may edit.
export const getLateAdjustments = async (req, res) => {
    try {
        const { month, year } = req.query;
        if (!month || !year) {
            return res.status(400).json({ message: 'month and year are required' });
        }
        const m = Number(month), y = Number(year);

        // The salary reports already carry the month's late working, so this
        // reads them rather than walking attendance a second time.
        const reports = await SalaryReport.find({ month: m, year: y }).lean();
        const overrides = await LateAdjustment.find({ month: m, year: y }).lean();
        const overrideMap = {};
        overrides.forEach((o) => { overrideMap[String(o.employee)] = o; });

        const entries = reports
            .filter((r) => (r.lateMinutes || 0) > 0)
            .map((r) => {
                const raw = splitLateMinutes(r.lateMinutes || 0);
                const o = overrideMap[String(r.employee)];
                const perDay = r.monthlyWorkingDays ? r.monthlySalary / r.monthlyWorkingDays : 0;
                return {
                    _id: o ? o._id : null,
                    employee: r.employee,
                    employeeName: r.employeeName,
                    empId: r.empId,
                    month: m,
                    year: y,
                    // Straight from attendance — not editable.
                    totalMinutes: raw.totalMinutes,
                    slabs: raw.slabs,
                    slabDays: raw.slabs,
                    originalExtraMinutes: raw.extraMinutes,
                    // What is actually charged on (the override, when there is one).
                    extraMinutes: r.lateExtraMinutes ?? raw.extraMinutes,
                    adjusted: Boolean(o),
                    reason: o?.reason || '',
                    adjustedByName: o?.adjustedByName || '',
                    adjustedAt: o?.updatedAt || null,
                    // Money, so the effect of an edit is visible before saving.
                    perDay: Math.round(perDay * 100) / 100,
                    lateDeduction: r.lateDeduction || 0,
                    deductionDays: perDay ? Math.round(((r.lateDeduction || 0) / perDay) * 100) / 100 : 0,
                };
            })
            .sort((a, b) => b.totalMinutes - a.totalMinutes);

        return res.status(200).json({ entries, month: m, year: y, message: 'Late adjustments retrieved' });
    } catch (error) {
        return res.status(500).json({ message: 'Something went wrong', error: error.message });
    }
};

// Set (or clear) the leftover minutes for one employee's month.
export const upsertLateAdjustment = async (req, res) => {
    try {
        const { employee, month, year, extraMinutes, reason } = req.body;
        if (!employee || !month || !year) {
            return res.status(400).json({ message: 'employee, month and year are required' });
        }
        const m = Number(month), y = Number(year);
        const emp = await Employee.findById(employee);
        if (!emp) return res.status(404).json({ message: 'Employee not found' });

        const minutes = Math.max(0, Math.round(Number(extraMinutes) || 0));

        // Remember what attendance actually produced, so the original is never lost.
        const report = await SalaryReport.findOne({ employee, month: m, year: y }).lean();
        const raw = splitLateMinutes(report?.lateMinutes || 0);
        if (minutes > raw.extraMinutes) {
            return res.status(400).json({
                message: `The leftover minutes can only be reduced. Attendance recorded ${raw.extraMinutes} leftover minute(s) for this month.`,
            });
        }

        const approver = await User.findById(req.user.id).select('name email').lean();

        await LateAdjustment.findOneAndUpdate(
            { employee, month: m, year: y },
            {
                employee, month: m, year: y,
                extraMinutes: minutes,
                originalMinutes: raw.extraMinutes,
                reason: reason || '',
                adjustedBy: req.user.id,
                adjustedByName: approver?.name || approver?.email || 'Admin',
            },
            { upsert: true, new: true, setDefaultsOnInsert: true }
        );

        await syncSalary(employee, y, m);

        const updated = await SalaryReport.findOne({ employee, month: m, year: y }).lean();
        return res.status(200).json({
            message: 'Late minutes adjusted',
            extraMinutes: minutes,
            lateDeduction: updated?.lateDeduction || 0,
            netPay: updated?.netPay || 0,
        });
    } catch (error) {
        return res.status(500).json({ message: 'Something went wrong', error: error.message });
    }
};

// Drop the override and go back to what attendance produced.
export const deleteLateAdjustment = async (req, res) => {
    try {
        const { id } = req.params;
        const row = await LateAdjustment.findById(id);
        if (!row) return res.status(404).json({ message: 'Late adjustment not found' });

        const { employee, year, month } = row;
        await row.deleteOne();
        await syncSalary(employee, year, month);

        return res.status(200).json({ message: 'Late adjustment removed' });
    } catch (error) {
        return res.status(500).json({ message: 'Something went wrong', error: error.message });
    }
};

// Preview: what a given leftover would cost, without saving anything.
export const previewLateAdjustment = async (req, res) => {
    try {
        const { slabs = 0, extraMinutes = 0 } = req.query;
        const effective = (Number(slabs) || 0) * 90 + Math.max(0, Math.round(Number(extraMinutes) || 0));
        return res.status(200).json({ days: lateDeductionForMinutes(effective) });
    } catch (error) {
        return res.status(500).json({ message: 'Something went wrong', error: error.message });
    }
};
