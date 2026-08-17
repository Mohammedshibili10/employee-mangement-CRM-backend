import SalaryReport from "../models/SalaryReport.js";
import Employee from "../models/Employee.js";
import Attendance from "../models/Attendance.js";
import LopRecord from "../models/LopRecord.js";
import SalaryAdvance from "../models/SalaryAdvance.js";
import LateAdjustment from "../models/LateAdjustment.js";
import Holiday from "../models/Holiday.js";
import { lateDeductionForMinutes, splitLateMinutes, minutesLate, startMinutesOf } from "../utils/attendanceRules.js";

// Total LOP (Loss of Pay) days for an employee in a month, combining the two
// sources that stay in sync: manual LOP entries (Deductions module) and days
// marked as LOP in the Attendance module.
async function readLopDays(employeeId, year, month) {
    // Pardoned LOP is excluded — it stays on record but isn't deducted from pay.
    const manual = await LopRecord.find({ employee: employeeId, month, year, pardoned: { $ne: true } });
    const manualDays = manual.reduce((sum, r) => sum + (Number(r.days) || 0), 0);

    const start = new Date(year, month - 1, 1, 0, 0, 0, 0);
    const end = new Date(year, month, 0, 23, 59, 59, 999);
    const attendance = await Attendance.find({ employee: employeeId, date: { $gte: start, $lte: end }, lop: { $gt: 0 }, lopPardoned: { $ne: true } });
    const attendanceDays = attendance.reduce((sum, r) => sum + (Number(r.lop) || 0), 0);

    return manualDays + attendanceDays;
}

// Total salary advance recovered from this month's pay. Every advance recorded
// in the Salary Adjustments section counts; a pardoned one stays on record but
// is not deducted.
async function readSalaryAdvance(employeeId, year, month) {
    const rows = await SalaryAdvance.find({ employee: employeeId, month, year, pardoned: { $ne: true } });
    return rows.reduce((sum, r) => sum + (Number(r.amount) || 0), 0);
}

// ---- calculation helpers ----------------------------------------------------

// ---- month / working day detection ------------------------------------------
// Nothing is hardcoded — every figure is detected from the selected month and
// year, so February follows the leap year on its own.
//
//   Working Days    = every day of the month, Sundays included (28/29/30/31)
//   Attendance Days = counted from the employee's own attendance records
//   Paid Sundays    = the month's Sundays, paid without attendance being marked
//   Total Paid Days = Attendance Days + Paid Sundays + approved paid leave
//
//   Daily Salary = Monthly Salary / Working Days
//   Gross        = Daily Salary x Total Paid Days, capped at Monthly Salary
//   Net Pay      = Gross - PF - ESI - the other applicable deductions

// Weekly off = Sunday. Single place to change if the company moves to a
// different weekly off or starts excluding a second day.
const WEEKLY_OFF_WEEKDAYS = [0]; // 0 = Sunday, 6 = Saturday
const isWeeklyOff = (date) => WEEKLY_OFF_WEEKDAYS.includes(new Date(date).getDay());

// The company holidays falling in a month, as a map of day-of-month -> holiday.
// Read straight from Holiday Management so a holiday applies to every employee
// at once, including anyone who joins after it was configured.
async function readHolidays(year, month) {
    const rows = await Holiday.find({
        date: { $gte: new Date(year, month - 1, 1), $lte: new Date(year, month, 0, 23, 59, 59, 999) },
    }).lean();
    const byDay = new Map();
    rows.forEach((h) => byDay.set(new Date(h.date).getDate(), h));
    return byDay;
}

// MONTH DAYS — the selected month's actual calendar length.
// June -> 30, July -> 31, February -> 28 or 29 depending on the year.
export function daysInMonth(year, month) {
    return new Date(year, month, 0).getDate();
}

// WORKING DAYS — EVERY day of the selected month, Sundays included. Same figure
// as Month Days, and the salary divisor: a day's pay is salary / this.
//
// Sundays are inside the count but can never cost anything: they are paid days,
// and the loss-of-pay walk below skips them, so an employee who works every
// weekday is paid the full month.
function countWorkingDays(year, month) {
    return daysInMonth(year, month);
}

const round = (n) => Math.round(n || 0);
// Round to 1 decimal place (used for amounts that can be fractional).
const round1 = (n) => Math.round((n || 0) * 10) / 10;
// Round to 2 decimal places.
const round2 = (n) => Math.round((n || 0) * 100) / 100;

// Paid-leave policy: the FIRST TWO leave days of each month are paid — one
// casual and one sick — and everything beyond them becomes loss of pay.
//
// The allowance is granted automatically on the days the employee did not work,
// whether the day was recorded as a leave or simply marked absent. Timesheets
// rarely distinguish the two, so keying the benefit off the leave type would
// quietly deny it to anyone whose day was entered as "absent".
const SICK_LEAVE_CAP = 1;
const CASUAL_LEAVE_CAP = 1;
const PAID_LEAVE_PER_MONTH = SICK_LEAVE_CAP + CASUAL_LEAVE_CAP;   // 1 CL + 1 SL
//
// PROBATION earns no allowance at all: an employee still on probation has every
// leave day treated as loss of pay.
const paidLeaveOf = (leaveDays, eligible = true) =>
    eligible ? Math.min(Math.max(0, leaveDays || 0), PAID_LEAVE_PER_MONTH) : 0;

// Late-arrival deduction policy — see lateDeductionForMinutes in attendanceRules
// for the ladder. Each day contributes its minutes past that employee's grace,
// the MONTH'S TOTAL is what the ladder is applied to, and an admin can adjust the
// leftover minutes that did not fill a complete 90-minute slab.
async function readLateAdjustment(employeeId, year, month) {
    const row = await LateAdjustment.findOne({ employee: employeeId, month, year }).lean();
    return row ? Number(row.extraMinutes) || 0 : null;
}

// Turn a month's raw late minutes into the fraction of a day's pay owed, letting
// an admin adjustment replace the leftover minutes.
function lateFigures(totalMinutes, adjustedExtra) {
    const raw = splitLateMinutes(totalMinutes);
    // Only the leftover is adjustable; the completed slabs stand.
    const extraMinutes = adjustedExtra == null ? raw.extraMinutes : Math.max(0, Math.round(adjustedExtra));
    // Recompute from the adjusted total so an admin who raises the leftover past
    // 90 simply fills another slab, exactly as real minutes would.
    const effectiveMinutes = raw.slabs * 90 + extraMinutes;
    return {
        lateMinutes: raw.totalMinutes,
        lateSlabs: raw.slabs,
        lateExtraMinutes: extraMinutes,
        lateFraction: lateDeductionForMinutes(effectiveMinutes),
    };
}

// Read a month's attendance for one employee, walking the calendar day by day.
//
//   attendanceDays — PRESENT DAYS from the real records, counted only on working
//                    days (present/late = 1, half day = 0.5, WFH = 1)
//   paidSundays    — the month's Sundays / weekly offs. Paid without attendance,
//                    and never counted as attendance or as an absence.
//
// A working day with no record earns nothing — it is neither attendance nor a
// paid day, so it simply drops out of the paid days.
async function readAttendance(employee, year, month, startMinutes) {
    const start = new Date(year, month - 1, 1, 0, 0, 0, 0);
    const end = new Date(year, month, 0, 23, 59, 59, 999);
    const records = await Attendance.find({
        employee: employee._id ?? employee,
        date: { $gte: start, $lte: end },
    });

    // Index by day-of-month so every calendar day can be looked up, including
    // the days that carry no record at all.
    //
    // A day should only ever hold one record, but the `date` field is written
    // with a mix of time-of-day values (day-start for admin entries, a real
    // timestamp for self check-ins), so a duplicate can slip past the once-a-day
    // guard. If a day does end up with more than one, take the most recently
    // updated and count it ONCE — never sum two records into a day, and never
    // silently depend on whichever happened to be read last.
    const byDay = new Map();
    for (const r of records) {
        const day = new Date(r.date).getDate();
        const existing = byDay.get(day);
        if (!existing) {
            byDay.set(day, r);
            continue;
        }
        const stamp = (x) => new Date(x.updatedAt || x.createdAt || x.date).getTime();
        if (stamp(r) >= stamp(existing)) byDay.set(day, r);
    }

    const totalDays = daysInMonth(year, month);

    // EMPLOYMENT WINDOW — the month only counts from the employee's joining date.
    // Someone who joined on the 17th was never due to work the 1st to the 16th,
    // so those days are not paid Sundays and above all are NOT a loss of pay.
    // Their salary is simply prorated to the days they were actually employed.
    const joining = employee?.joiningDate ? new Date(employee.joiningDate) : null;
    let firstEmployedDay = 1;
    if (joining) {
        const jYear = joining.getFullYear();
        const jMonth = joining.getMonth() + 1;
        if (jYear > year || (jYear === year && jMonth > month)) {
            firstEmployedDay = totalDays + 1;      // not employed at all this month
        } else if (jYear === year && jMonth === month) {
            firstEmployedDay = joining.getDate();  // joined part-way through
        }
    }

    // Real attendance always wins over the joining date. If someone has records
    // from before the date on their profile then they evidently were working, and
    // the joining date is the thing that is wrong — never drop a day they were
    // actually marked present for, or the fix would quietly cut their pay.
    for (const day of byDay.keys()) {
        if (day < firstEmployedDay) firstEmployedDay = day;
    }

    // ...and the window closes on the last working day. Someone who left on the
    // 16th was never due to work the 17th onwards, so those days are not paid
    // Sundays and are NOT a loss of pay.
    //
    // Unlike the joining date, this one is authoritative: a leaving date is only
    // ever set deliberately, so any record dated after it is the mistake (a stray
    // mark on a timesheet) and is ignored rather than re-opening the month.
    const leaving = employee?.lastWorkingDate ? new Date(employee.lastWorkingDate) : null;
    let lastEmployedDay = totalDays;
    if (leaving) {
        const lYear = leaving.getFullYear();
        const lMonth = leaving.getMonth() + 1;
        if (lYear < year || (lYear === year && lMonth < month)) {
            lastEmployedDay = 0;                  // already gone before this month
        } else if (lYear === year && lMonth === month) {
            lastEmployedDay = leaving.getDate();  // left part-way through
        }
    }

    // The month can never run past TODAY. A day that has not happened yet is not
    // an employed day: it earns nothing, not even a paid Sunday, and it is not a
    // loss of pay either. Without this a payroll run for a future month would
    // quietly pay everyone for that month's Sundays.
    //
    // Today itself is still in progress, so its attendance may simply not be
    // marked yet — counting it would show a loss of pay for a day the employee
    // is still working. It is therefore included only once it carries a record.
    const today = new Date();
    if (new Date(year, month - 1, 1) > today) {
        lastEmployedDay = 0;                                  // month hasn't started
    } else if (today.getFullYear() === year && today.getMonth() + 1 === month) {
        const todayDay = today.getDate();
        const upTo = byDay.has(todayDay) ? todayDay : todayDay - 1;
        lastEmployedDay = Math.min(lastEmployedDay, upTo);
    }

    // Company holidays for this month, applied to every employee alike.
    const holidays = await readHolidays(year, month);

    let attendanceDays = 0, paidSundays = 0, paidHolidays = 0, employedDays = 0;
    let leaveDays = 0, sickLeaveDays = 0, casualLeaveDays = 0, lateMinutes = 0, wfhDeductionDays = 0;

    // Start at the joining day: nothing before it belongs to this employee.
    for (let d = firstEmployedDay; d <= lastEmployedDay; d++) {
        employedDays += 1;

        // Sundays / weekly offs are PAID days on which no attendance is marked.
        // They are counted separately as paid days, and are never attendance and
        // never loss of pay.
        if (isWeeklyOff(new Date(year, month - 1, d))) {
            paidSundays += 1;
            continue;
        }

        const r = byDay.get(d);

        // A COMPANY HOLIDAY is paid exactly like a Sunday — nobody was due to
        // work, so it is never attendance and never a loss of pay. It applies
        // whether it comes from Holiday Management or was marked on the day
        // itself, and it is settled before any record is read so an employee who
        // did come in cannot be paid twice for it.
        const holiday = holidays.get(d);
        if ((holiday && holiday.paid !== false) || r?.status === 'holiday') {
            paidHolidays += 1;
            continue;
        }
        // An UNPAID holiday (a shutdown) is a non-working day: it earns nothing,
        // but it is not a loss of pay either — nobody was due in. Taking it back
        // out of the employed days prorates the month instead of charging it.
        if (holiday) {
            employedDays -= 1;
            continue;
        }

        // A working day with NO attendance record earns nothing — it becomes a
        // loss-of-pay day. It is never written off just because it is late in
        // the month; if the record is not there, the day was not worked.
        if (!r) continue;

        // ---- attendance days: only the records actually marked on working days.
        if (r.status === 'present' || r.status === 'late') {
            attendanceDays += 1;
            // Judged on the ACTUAL check-in time, not the label on the day — a
            // day saved as "present" with a 10:45 arrival is still assessed, and
            // a day labelled "late" that arrived within the grace costs nothing.
            // A pardoned late arrival keeps its record but contributes no minutes.
            // The ladder is applied to the month's total, not to this one day.
            if (!r.latePardoned) lateMinutes += minutesLate(r.checkIn, startMinutes);
        } else if (r.status === 'half-day') {
            attendanceDays += 0.5;      // the other half is lost
        } else if (r.status === 'wfh') {
            attendanceDays += 1;
            if (!r.wfhPardoned) wfhDeductionDays += 1;
        } else if (r.status === 'absent' || r.status === 'leave') {
            // A day not worked — recorded either as a leave or simply as absent.
            // Both count towards the monthly leave allowance: the first two are
            // paid (1 CL + 1 SL, see paidLeaveOf) and the rest become LOP.
            leaveDays += 1;
            if (r.status === 'leave') {
                if (r.leaveType === 'sick') sickLeaveDays += 1;
                else if (r.leaveType === 'casual') casualLeaveDays += 1;
            }
        }
    }

    return {
        attendanceDays, paidSundays, paidHolidays, employedDays,
        leaveDays, sickLeaveDays, casualLeaveDays, lateMinutes, wfhDeductionDays,
    };
}

// Pure earnings math from attendance figures (no DB access) so it can be reused
// both when generating from real attendance and when an admin overrides the
// working days / attendance days in the salary breakdown.
// Salary split: Basic 50% & HRA 20% of gross; LTA is 10% of Basic Pay;
// Special Allowance is whatever is left of gross.
//
// The whole calculation:
//   Daily Salary    = Monthly Salary / Working Days   (working days = all days
//                     in the month, Sundays included)
//   Total Paid Days = Attendance Days + Paid Sundays + approved paid leave
//   Gross / Earned  = Daily Salary x Total Paid Days, capped at Monthly Salary
//   Net Pay         = Gross - PF - ESI - the other applicable deductions
//
// Sundays are paid even though no attendance is marked on them; a working day
// with no attendance is simply not paid.
export function deriveEarnings({ monthlySalary, workingDays, attendanceDays, paidSundays = 0, paidHolidays = 0, employedDays = null, leaveDays = 0, paidLeaveEligible = true, sickLeaveDays, casualLeaveDays, lateFraction = 0, lopDays = 0, wfhDeductionDays = 0 }) {
    // A day's pay = salary / working days, and working days is every day of the
    // month (Sundays included).
    const perDay = workingDays > 0 ? monthlySalary / workingDays : 0;

    // Only the first sick + first casual leave are paid; anything beyond the cap
    // is unpaid and therefore simply never becomes a paid day.
    const paidLeaveDays = paidLeaveOf(leaveDays, paidLeaveEligible);

    // Days of the month this employee was actually on the payroll for. The whole
    // month, unless they joined part-way through — then only from the joining day.
    const daysOnPayroll = employedDays != null ? employedDays : workingDays;

    // Total Paid Days = Attendance Days + Paid Sundays + Paid Holidays +
    // approved paid leave, and never more than the days they were employed for.
    const paidDays = Math.min(daysOnPayroll, Math.max(0, attendanceDays + paidSundays + paidHolidays + paidLeaveDays));

    // LOSS OF PAY = Working Days − Present Days − Paid Leaves − Paid Sundays
    //
    // i.e. every day on the payroll that is not covered by attendance, an
    // approved leave, or a paid Sunday. A working day with no attendance record
    // counts here — it is never written off just because it is late in the month.
    const lop = round2(Math.max(0, daysOnPayroll - paidDays));

    // Gross / Earned Salary = a full day's pay x the paid days, and NEVER more
    // than the agreed monthly salary.
    const grossSalary = Math.min(round2(perDay * paidDays), monthlySalary);
    const basicPay = round2(grossSalary * 0.5);
    const hra = round2(grossSalary * 0.2);
    // LTA = ROUND(Basic Pay * 10 / 100, 2) — always 10% of Basic Pay.
    const lta = round2(basicPay * 0.1);
    const specialAllowance = round2(grossSalary - basicPay - hra - lta);

    // Actual Pay = the earned amount, likewise capped at the monthly salary.
    // This is the figure every deduction (PF, ESI, LOP, late, WFH, advances…)
    // comes off to give Net Pay.
    const actualPay = Math.min(round2(perDay * paidDays), round2(monthlySalary));
    const lateDeduction = round2(lateFraction * perDay);
    // Recorded LOP (from the LOP module) is deducted at a full day's pay per LOP day.
    const recordedLopDays = Number(lopDays) || 0;
    const lopDeduction = round2(perDay * recordedLopDays);
    const wfhDeduction = round2((perDay * 0.5) * (wfhDeductionDays || 0));

    // PF and ESI are statutory contributions on the AGREED MONTHLY salary, so
    // they stay the same whatever the month's attendance came to — but there is
    // nothing to contribute on a month with no paid days at all (not yet started,
    // or the employee was not on the payroll for any of it).
    let pfDeduction = 0;
    let employeeEsi = 0;
    if (paidDays > 0) {
        pfDeduction = monthlySalary > 30000 ? 1800 : round2((monthlySalary * 0.5) * 0.12);
        employeeEsi = monthlySalary <= 21000 ? round2(monthlySalary * 0.0075) : 0;
    }

    return {
        // The month's total calendar days, Sundays included — the divisor.
        monthlyWorkingDays: workingDays,
        // Present days, counted from the employee's own attendance records.
        attendanceDays,
        // Sundays / weekly offs in the month — paid without attendance.
        paidSundays,
        // Company holidays in the month — likewise paid without attendance.
        paidHolidays,
        // Attendance + paid Sundays + approved leave: what the salary is paid on.
        paidDays: round2(paidDays),
        // Total leave days taken this month (all types).
        leaveDays,
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
        wfhDeduction,
        pfDeduction,
        employeeEsi,
    };
}

// Compute all attendance-derived + earnings fields for one employee by reading
// their real attendance for the month.
async function computeSalary(employee, year, month, workingDays) {
    const { attendanceDays, paidSundays, paidHolidays, employedDays, leaveDays, sickLeaveDays, casualLeaveDays, lateMinutes, wfhDeductionDays } =
        await readAttendance(employee, year, month, startMinutesOf(employee));
    const lopDays = await readLopDays(employee._id, year, month);
    const salaryAdvance = await readSalaryAdvance(employee._id, year, month);

    // The month's late minutes, split into completed 90-minute slabs and the
    // leftover an admin may have adjusted in Salary Adjustments.
    const late = lateFigures(lateMinutes, await readLateAdjustment(employee._id, year, month));

    return {
        // Recovered from this month's pay — summed from the Salary Advance records.
        salaryAdvance,
        // Late-arrival working: kept on the report so the UI can show how the
        // deduction was arrived at without recomputing it.
        lateMinutes: late.lateMinutes,
        lateSlabs: late.lateSlabs,
        lateExtraMinutes: late.lateExtraMinutes,
        ...deriveEarnings({
        monthlySalary: employee.salary || 0,
        workingDays,
        attendanceDays,
        paidSundays,
        paidHolidays,
        leaveDays,
        // Probation employees get no monthly paid-leave allowance.
        paidLeaveEligible: employee.employmentStatus !== 'probation',
        sickLeaveDays,
        casualLeaveDays,
        lateFraction: late.lateFraction,
        lopDays,
        wfhDeductionDays,
        employedDays,
        }),
    };
}

function computeNetPay(r) {
    const deductions =
        (r.lopDeduction || 0) + (r.lateDeduction || 0) + (r.salaryAdvance || 0) +
        (r.wfhDeduction || 0) + (r.officeExpenses || 0) + (r.assetDeduction || 0) +
        (r.pfDeduction || 0) + (r.employeeEsi || 0);
    // Net pay is never negative (deductions can't exceed pay into the red).
    return Math.max(0, round2((r.actualPay || 0) - deductions));
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

        // A month that has not started has no attendance to pay on, so generating
        // it would only produce empty reports that look like real payroll.
        if (new Date(year, month - 1, 1) > new Date()) {
            return res.status(400).json({
                message: 'That payroll month has not started yet — there is no attendance to generate salary from.',
            });
        }

        const empFilter = {};
        if (department) empFilter.department = department;

        // Only employees who were on the payroll during this month. Someone who
        // left mid-month still gets their final payslip (their last working day
        // falls inside it); someone who left earlier is skipped entirely, so no
        // salary is ever generated for a period after they had gone.
        empFilter.$or = [
            { status: 'active' },
            { lastWorkingDate: { $gte: new Date(year, month - 1, 1) } },
        ];

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
                // Only the MANUALLY entered deductions start at zero. Anything
                // calculated from attendance — including the WFH deduction — must
                // keep the value computed above; zeroing it here would silently
                // under-deduct every freshly generated month until someone
                // happened to recalculate it.
                officeExpenses: 0,
                assetDeduction: 0,
                ...calc,
                employee: emp._id,
                empId: emp.empId,
                employeeName: emp.name,
                department: emp.department?._id,
                departmentName: emp.department?.name || '',
                month,
                year,
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
        const { month, year, employee, department, includeInactive } = req.query;
        const filter = {};
        if (month) filter.month = Number(month);
        if (year) filter.year = Number(year);
        if (employee) filter.employee = employee;
        if (department) filter.department = department;

        // An employee who has left stays on the report for the month they were
        // still working — someone who left on 15 July belongs in July's payroll —
        // and only drops out from the following month. Reports are never deleted,
        // so every past month keeps the people who were there at the time.
        // With no period given the caller wants the whole history, so nothing is
        // filtered out — a payslip that has been generated is a completed record
        // and must stay visible whatever the employee's status is today.
        if (String(includeInactive) !== 'true' && month && year) {
            const monthStart = new Date(Number(year), Number(month) - 1, 1);
            const onPayroll = { $or: [{ status: 'active' }, { lastWorkingDate: { $gte: monthStart } }] };

            const visibleIds = await Employee.find(onPayroll).distinct('_id');
            if (employee) {
                const visible = visibleIds.some((id) => String(id) === String(employee));
                if (!visible) {
                    return res.status(200).json({ reports: [], message: 'Salary reports retrieved successfully' });
                }
            } else {
                filter.employee = { $in: visibleIds };
            }
        }

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
                // An overridden attendance implies the rest of the month is lost.
                paidSundays: report.paidSundays || 0,
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
        // Working days are re-detected from the payroll period, so the figure
        // always matches the month (and ignores any stored/overridden value).
        const workingDays = countWorkingDays(year, month);
        const calc = await computeSalary(employee, year, month, workingDays);
        Object.assign(report, calc);
        report.netPay = computeNetPay(report);
        await report.save();
    } catch (e) {
        console.error('recalcSalaryForMonth failed:', e.message);
    }
};
