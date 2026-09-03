import Holiday from "../models/Holiday.js";
import Employee from "../models/Employee.js";
import Attendance from "../models/Attendance.js";
import User from "../models/User.js";
import { recalcSalaryForMonth } from "./salaryController.js";

// Local midnight, so a holiday matches the whole calendar day whatever time of
// day it happened to be entered.
const atMidnight = (value) => {
    const d = new Date(value);
    d.setHours(0, 0, 0, 0);
    return d;
};

// Records this holiday created or converted are tagged with its id, so removing
// the holiday can find its own work and leave everything else alone.
const sourceTag = (holidayId) => `holiday:${holidayId}`;

// A day nobody was due in for. These are safe to turn into a holiday because the
// holiday says the same thing — the employee did not work. Days that show real
// work (present / late / half-day / wfh) are never touched.
const REPLACEABLE = ['absent', 'leave'];

// Write the holiday across the targeted workforce so it SHOWS in Attendance.
//
// Payroll reads the Holiday collection and respects the target criteria (all,
// department, or specific employee).
async function applyHolidayToAttendance(holiday) {
    const day = atMidnight(holiday.date);
    const dayEnd = new Date(day);
    dayEnd.setHours(23, 59, 59, 999);

    const empQuery = {
        $and: [
            { $or: [{ joiningDate: { $lte: dayEnd } }, { joiningDate: null }] },
            { $or: [{ lastWorkingDate: { $gte: day } }, { lastWorkingDate: null }, { lastWorkingDate: { $exists: false } }] },
        ],
    };

    if (holiday.applicableTo === 'department' && holiday.department) {
        empQuery.department = holiday.department;
    } else if (holiday.applicableTo === 'employee' && Array.isArray(holiday.employees) && holiday.employees.length > 0) {
        empQuery._id = { $in: holiday.employees };
    }

    // Only people actually on the payroll that day matching target scope.
    const employees = await Employee.find(empQuery).select('_id department').lean();

    const existing = await Attendance.find({ date: { $gte: day, $lte: dayEnd } });
    const byEmployee = new Map(existing.map((r) => [String(r.employee), r]));

    let created = 0, converted = 0, keptWorking = 0;

    for (const emp of employees) {
        const record = byEmployee.get(String(emp._id));

        if (!record) {
            await Attendance.create({
                employee: emp._id,
                date: day,
                status: 'holiday',
                source: sourceTag(holiday._id),
            });
            created += 1;
            continue;
        }

        if (record.status === 'holiday') continue;

        // Someone who genuinely worked keeps their record — the day is still paid
        // for everyone either way.
        if (!REPLACEABLE.includes(record.status)) { keptWorking += 1; continue; }

        record.holidayPrevStatus = record.status;
        record.status = 'holiday';
        record.leaveType = undefined;
        record.source = sourceTag(holiday._id);
        await record.save();
        converted += 1;
    }

    return { created, converted, keptWorking };
}

// Undo the above: delete what the holiday created, and put back what it changed.
async function removeHolidayFromAttendance(holiday) {
    const day = atMidnight(holiday.date);
    const dayEnd = new Date(day);
    dayEnd.setHours(23, 59, 59, 999);
    const tag = sourceTag(holiday._id);

    // Records this holiday created outright.
    await Attendance.deleteMany({ date: { $gte: day, $lte: dayEnd }, source: tag, holidayPrevStatus: { $in: [null, undefined] } });

    // Records it converted — restore the status they had before.
    const converted = await Attendance.find({ date: { $gte: day, $lte: dayEnd }, source: tag, holidayPrevStatus: { $nin: [null, undefined] } });
    for (const r of converted) {
        r.status = r.holidayPrevStatus;
        r.holidayPrevStatus = undefined;
        r.source = undefined;
        await r.save();
    }
}

// Check if two holidays clash on target scope
async function checkHolidayClash(date, targetScope, excludeId = null) {
    const day = atMidnight(date);
    const filter = { date: day };
    if (excludeId) filter._id = { $ne: excludeId };

    const existingHolidays = await Holiday.find(filter).lean();
    if (!existingHolidays.length) return null;

    const { applicableTo = 'all', department = null, employees = [] } = targetScope;

    for (const existing of existingHolidays) {
        const exApp = existing.applicableTo || 'all';

        // 'all' clashes with everything on that date
        if (applicableTo === 'all' || exApp === 'all') {
            return existing;
        }

        if (applicableTo === 'department' && exApp === 'department') {
            if (String(department) === String(existing.department)) return existing;
        }

        if (applicableTo === 'employee' && exApp === 'employee') {
            const exEmpSet = new Set((existing.employees || []).map((e) => String(e)));
            const hasOverlap = (employees || []).some((e) => exEmpSet.has(String(e)));
            if (hasOverlap) return existing;
        }

        if (applicableTo === 'department' && exApp === 'employee') {
            // Check if any of the specific employees in existing belong to this department
            if (existing.employees?.length) {
                const count = await Employee.countDocuments({ _id: { $in: existing.employees }, department });
                if (count > 0) return existing;
            }
        }

        if (applicableTo === 'employee' && exApp === 'department') {
            // Check if any of target employees belong to existing department
            if (employees?.length) {
                const count = await Employee.countDocuments({ _id: { $in: employees }, department: existing.department });
                if (count > 0) return existing;
            }
        }
    }

    return null;
}

// Adding, moving or removing a holiday changes who was due to work that month,
// so every employee's payroll for it has to follow.
async function syncMonth(date) {
    const d = new Date(date);
    const year = d.getFullYear();
    const month = d.getMonth() + 1;
    const employees = await Employee.find().select('_id').lean();
    for (const e of employees) {
        await recalcSalaryForMonth(e._id, year, month);
    }
}

// List holidays. Filtered to a month/year when both are given, otherwise the
// whole year, otherwise everything — newest first.
export const getHolidays = async (req, res) => {
    try {
        const { month, year } = req.query;
        const filter = {};
        if (year) {
            const y = Number(year);
            if (month) {
                const m = Number(month);
                filter.date = { $gte: new Date(y, m - 1, 1), $lte: new Date(y, m, 0, 23, 59, 59, 999) };
            } else {
                filter.date = { $gte: new Date(y, 0, 1), $lte: new Date(y, 11, 31, 23, 59, 59, 999) };
            }
        }
        const holidays = await Holiday.find(filter)
            .populate('department', 'name head')
            .populate('employees', 'name empId department')
            .sort({ date: 1 })
            .lean();
        return res.status(200).json({ holidays, message: 'Holidays retrieved' });
    } catch (error) {
        return res.status(500).json({ message: 'Something went wrong', error: error.message });
    }
};

export const createHoliday = async (req, res) => {
    try {
        const { name, date, description, paid, applicableTo = 'all', department, employees } = req.body;
        if (!name || !date) {
            return res.status(400).json({ message: 'Holiday name and date are required' });
        }

        if (applicableTo === 'department' && !department) {
            return res.status(400).json({ message: 'Please select a department for this holiday' });
        }
        if (applicableTo === 'employee' && (!employees || !employees.length)) {
            return res.status(400).json({ message: 'Please select at least one employee for this holiday' });
        }

        const day = atMidnight(date);
        const targetScope = {
            applicableTo,
            department: applicableTo === 'department' ? department : null,
            employees: applicableTo === 'employee' ? (Array.isArray(employees) ? employees : [employees]) : [],
        };

        const clash = await checkHolidayClash(day, targetScope);
        if (clash) {
            return res.status(400).json({ message: `${clash.name} is already recorded on that date for matching employees.` });
        }

        const creator = await User.findById(req.user.id).select('name email').lean();
        const holiday = await Holiday.create({
            name,
            date: day,
            description: description || '',
            paid: paid === undefined ? true : Boolean(paid),
            createdByName: creator?.name || creator?.email || 'Admin',
            applicableTo: targetScope.applicableTo,
            department: targetScope.department,
            employees: targetScope.employees,
        });

        const populatedHoliday = await Holiday.findById(holiday._id)
            .populate('department', 'name head')
            .populate('employees', 'name empId department')
            .lean();

        const applied = await applyHolidayToAttendance(holiday);
        await syncMonth(day);
        return res.status(201).json({
            message: `Holiday added — marked for ${applied.created + applied.converted} employee(s) in Attendance.`,
            holiday: populatedHoliday,
            applied,
        });
    } catch (error) {
        return res.status(500).json({ message: 'Something went wrong', error: error.message });
    }
};

export const updateHoliday = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, date, description, paid, applicableTo, department, employees } = req.body;

        const holiday = await Holiday.findById(id);
        if (!holiday) return res.status(404).json({ message: 'Holiday not found' });

        const previousDate = holiday.date;

        if (name) holiday.name = name;
        if (date) holiday.date = atMidnight(date);
        if (description !== undefined) holiday.description = description;
        if (paid !== undefined) holiday.paid = Boolean(paid);

        if (applicableTo !== undefined) {
            holiday.applicableTo = applicableTo;
            if (applicableTo === 'department') {
                if (!department) return res.status(400).json({ message: 'Please select a department for this holiday' });
                holiday.department = department;
                holiday.employees = [];
            } else if (applicableTo === 'employee') {
                if (!employees || !employees.length) return res.status(400).json({ message: 'Please select at least one employee for this holiday' });
                holiday.employees = Array.isArray(employees) ? employees : [employees];
                holiday.department = null;
            } else {
                holiday.applicableTo = 'all';
                holiday.department = null;
                holiday.employees = [];
            }
        }

        const targetScope = {
            applicableTo: holiday.applicableTo,
            department: holiday.department,
            employees: holiday.employees,
        };

        const clash = await checkHolidayClash(holiday.date, targetScope, holiday._id);
        if (clash) {
            return res.status(400).json({ message: `${clash.name} is already recorded on that date for matching employees.` });
        }

        await removeHolidayFromAttendance({ _id: holiday._id, date: previousDate });
        await holiday.save();

        const populatedHoliday = await Holiday.findById(holiday._id)
            .populate('department', 'name head')
            .populate('employees', 'name empId department')
            .lean();

        const applied = await applyHolidayToAttendance(holiday);

        await syncMonth(previousDate);
        if (atMidnight(previousDate).getTime() !== holiday.date.getTime()) await syncMonth(holiday.date);

        return res.status(200).json({ message: 'Holiday updated', holiday: populatedHoliday, applied });
    } catch (error) {
        return res.status(500).json({ message: 'Something went wrong', error: error.message });
    }
};

// Re-write a holiday across Attendance. Useful for a holiday configured before
// an employee joined, or one added before the marking existed at all.
export const applyHoliday = async (req, res) => {
    try {
        const { id } = req.params;
        const holiday = await Holiday.findById(id);
        if (!holiday) return res.status(404).json({ message: 'Holiday not found' });

        const applied = await applyHolidayToAttendance(holiday);
        await syncMonth(holiday.date);

        const total = applied.created + applied.converted;
        return res.status(200).json({
            message: total
                ? `${holiday.name} marked for ${total} employee(s) in Attendance` +
                  (applied.keptWorking ? ` (${applied.keptWorking} kept their worked record).` : '.')
                : 'Attendance was already up to date for this holiday.',
            applied,
        });
    } catch (error) {
        return res.status(500).json({ message: 'Something went wrong', error: error.message });
    }
};

export const deleteHoliday = async (req, res) => {
    try {
        const { id } = req.params;
        const holiday = await Holiday.findById(id);
        if (!holiday) return res.status(404).json({ message: 'Holiday not found' });

        const { date } = holiday;
        await removeHolidayFromAttendance(holiday);
        await holiday.deleteOne();
        await syncMonth(date);

        return res.status(200).json({ message: 'Holiday removed' });
    } catch (error) {
        return res.status(500).json({ message: 'Something went wrong', error: error.message });
    }
};
