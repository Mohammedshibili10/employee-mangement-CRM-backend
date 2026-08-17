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

// Write the holiday across the workforce so it SHOWS in Attendance.
//
// Payroll does not depend on these records — it reads the Holiday collection
// directly — so a missing one can never cost anyone money. They exist purely so
// the day reads as "Holiday" in the attendance list, the monthly grid and the
// exports.
async function applyHolidayToAttendance(holiday) {
    const day = atMidnight(holiday.date);
    const dayEnd = new Date(day);
    dayEnd.setHours(23, 59, 59, 999);

    // Only people actually on the payroll that day.
    const employees = await Employee.find({
        $and: [
            { $or: [{ joiningDate: { $lte: dayEnd } }, { joiningDate: null }] },
            { $or: [{ lastWorkingDate: { $gte: day } }, { lastWorkingDate: null }, { lastWorkingDate: { $exists: false } }] },
        ],
    }).select('_id').lean();

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
        const holidays = await Holiday.find(filter).sort({ date: 1 }).lean();
        return res.status(200).json({ holidays, message: 'Holidays retrieved' });
    } catch (error) {
        return res.status(500).json({ message: 'Something went wrong', error: error.message });
    }
};

export const createHoliday = async (req, res) => {
    try {
        const { name, date, description, paid } = req.body;
        if (!name || !date) {
            return res.status(400).json({ message: 'Holiday name and date are required' });
        }
        const day = atMidnight(date);

        const clash = await Holiday.findOne({ date: day });
        if (clash) {
            return res.status(400).json({ message: `${clash.name} is already recorded on that date.` });
        }

        const creator = await User.findById(req.user.id).select('name email').lean();
        const holiday = await Holiday.create({
            name,
            date: day,
            description: description || '',
            paid: paid === undefined ? true : Boolean(paid),
            createdByName: creator?.name || creator?.email || 'Admin',
        });

        const applied = await applyHolidayToAttendance(holiday);
        await syncMonth(day);
        return res.status(201).json({
            message: `Holiday added — marked for ${applied.created + applied.converted} employee(s) in Attendance.`,
            holiday,
            applied,
        });
    } catch (error) {
        return res.status(500).json({ message: 'Something went wrong', error: error.message });
    }
};

export const updateHoliday = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, date, description, paid } = req.body;

        const holiday = await Holiday.findById(id);
        if (!holiday) return res.status(404).json({ message: 'Holiday not found' });

        // A holiday can be moved to another month, so both months re-sync.
        const previousDate = holiday.date;

        if (name) holiday.name = name;
        if (date) holiday.date = atMidnight(date);
        if (description !== undefined) holiday.description = description;
        if (paid !== undefined) holiday.paid = Boolean(paid);

        const clash = await Holiday.findOne({ date: holiday.date, _id: { $ne: holiday._id } });
        if (clash) {
            return res.status(400).json({ message: `${clash.name} is already recorded on that date.` });
        }

        // Take the old day's markings off before writing the new day's.
        await removeHolidayFromAttendance({ _id: holiday._id, date: previousDate });
        await holiday.save();
        const applied = await applyHolidayToAttendance(holiday);

        await syncMonth(previousDate);
        if (atMidnight(previousDate).getTime() !== holiday.date.getTime()) await syncMonth(holiday.date);

        return res.status(200).json({ message: 'Holiday updated', holiday, applied });
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
