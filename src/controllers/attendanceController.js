import Attendance from "../models/Attendance.js";
import User from "../models/User.js";
import Employee from "../models/Employee.js";
import { recalcSalaryForMonth } from "./salaryController.js";
import { deriveStatusFor, overtimeFor, startMinutesOf, endMinutesOf } from "../utils/attendanceRules.js";

// Keep any existing salary report for this employee's month in sync after
// attendance/leave changes (no manual "recalculate" needed).
const syncSalary = (employeeId, date) => {
    const d = new Date(date);
    return recalcSalaryForMonth(employeeId, d.getFullYear(), d.getMonth() + 1);
};

const getDayRange = (date) => {
    const start = new Date(date);
    start.setHours(0, 0, 0, 0);
    const end = new Date(date);
    end.setHours(23, 59, 59, 999);
    return { start, end };
};

// Attendance status / overtime are derived from the EMPLOYEE'S own working
// hours (deriveStatusFor / overtimeFor in attendanceRules). These thin wrappers
// resolve an employee's start/end and delegate, so the callers stay readable.
const deriveStatus = (checkIn, employee) => deriveStatusFor(checkIn, startMinutesOf(employee));
const computeOvertime = (checkOut, employee) => overtimeFor(checkOut, endMinutesOf(employee));

export const checkIn = async (req, res) => {
    try {
        const { latitude, longitude, image } = req.body;
        if (latitude == null || longitude == null || !image) {
            return res.status(400).json({ message: 'Location and selfie are required' });
        }

        const user = await User.findById(req.user.id).lean();
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }
        const employee = await Employee.findOne({ email: user.email });
        if (!employee) {
            return res.status(404).json({ message: 'Employee profile not found' });
        }

        const { start, end } = getDayRange(new Date());
        const existing = await Attendance.findOne({
            employee: employee._id,
            date: { $gte: start, $lte: end },
        });
        if (existing) {
            return res.status(400).json({ message: 'You have already checked in today' });
        }

        const now = new Date();

        // Same punctuality rule as an admin-entered record, using this
        // employee's own working hours.
        const status = deriveStatus(now, employee);

        const attendance = await Attendance.create({
            employee: employee._id,
            date: now,
            checkIn: now,
            status,
            latitude,
            longitude,
            image,
        });

        await syncSalary(employee._id, now);
        return res.status(201).json({ message: `Check-in successful (${status})`, attendance });
    } catch (error) {
        return res.status(500).json({ message: 'Something went wrong', error: error.message });
    }
};

export const checkOut = async (req, res) => {
    try {
        const { latitude, longitude, image } = req.body;
        if (latitude == null || longitude == null || !image) {
            return res.status(400).json({ message: 'Location and selfie are required' });
        }

        const user = await User.findById(req.user.id).lean();
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }
        const employee = await Employee.findOne({ email: user.email });
        if (!employee) {
            return res.status(404).json({ message: 'Employee profile not found' });
        }

        const { start, end } = getDayRange(new Date());
        const attendance = await Attendance.findOne({
            employee: employee._id,
            date: { $gte: start, $lte: end },
        });
        if (!attendance) {
            return res.status(400).json({ message: 'You have not checked in today' });
        }
        if (attendance.checkOut) {
            return res.status(400).json({ message: 'You have already checked out today' });
        }

        const checkOutTime = new Date();

        // Overtime is measured against this employee's own end time.
        const { overtime, overtimeMinutes } = computeOvertime(checkOutTime, employee);

        attendance.checkOut = checkOutTime;
        attendance.checkOutLatitude = latitude;
        attendance.checkOutLongitude = longitude;
        attendance.checkOutImage = image;
        attendance.overtime = overtime;
        attendance.overtimeMinutes = overtimeMinutes;
        await attendance.save();

        await syncSalary(attendance.employee, attendance.date);
        const note = overtime ? ` (overtime: ${overtimeMinutes} min)` : '';
        return res.status(200).json({ message: `Check-out successful${note}`, attendance });
    } catch (error) {
        return res.status(500).json({ message: 'Something went wrong', error: error.message });
    }
};

export const markAttendance = async (req, res) => {
    try {
        const { employee, date, checkIn, checkOut, status, leaveType, lop } = req.body;

        if (!employee) {
            return res.status(400).json({ message: 'Employee is required' });
        }

        const validStatus = ['present', 'absent', 'late', 'half-day', 'leave', 'wfh'];
        if (status && !validStatus.includes(status)) {
            return res.status(400).json({ message: 'Invalid status value' });
        }
        if (leaveType && !['sick', 'casual'].includes(leaveType)) {
            return res.status(400).json({ message: 'Invalid leave type' });
        }

        // Load the employee so status/overtime use their own working hours.
        const employeeDoc = await Employee.findById(employee);
        if (!employeeDoc) {
            return res.status(404).json({ message: 'Employee not found' });
        }

        const attendanceDate = date ? new Date(date) : new Date();

        const { start, end } = getDayRange(attendanceDate);
        const existing = await Attendance.findOne({
            employee,
            date: { $gte: start, $lte: end },
        });
        if (existing) {
            return res.status(400).json({ message: 'Attendance already marked for this day' });
        }

        // A leave record (Sick/Casual, or a typeless "None" full leave) has no
        // check-in/out; a worked day derives its status from the check-in.
        const isLeave = !!leaveType || status === 'leave';
        const finalStatus = isLeave ? 'leave' : (status || deriveStatus(checkIn, employeeDoc));
        const { overtime, overtimeMinutes } = isLeave ? { overtime: false, overtimeMinutes: 0 } : computeOvertime(checkOut, employeeDoc);

        const attendance = await Attendance.create({
            employee,
            date: attendanceDate,
            checkIn: isLeave ? undefined : (checkIn || undefined),
            checkOut: isLeave ? undefined : (checkOut || undefined),
            status: finalStatus,
            leaveType: leaveType || undefined,
            overtime,
            overtimeMinutes,
            lop: isLeave ? 0 : (Number(lop) || 0),
        });

        await syncSalary(employee, attendanceDate);
        return res.status(201).json({ message: 'Attendance marked successfully', attendance });
    } catch (error) {
        return res.status(500).json({ message: 'Something went wrong', error: error.message });
    }
};

export const updateAttendance = async (req, res) => {
    try {
        const { id } = req.params;
        const { date, checkIn, checkOut, status, leaveType, lop, lopPardoned, wfhPardoned } = req.body;

        const validStatus = ['present', 'absent', 'late', 'half-day', 'leave', 'wfh'];
        if (status && !validStatus.includes(status)) {
            return res.status(400).json({ message: 'Invalid status value' });
        }
        if (leaveType && !['sick', 'casual'].includes(leaveType)) {
            return res.status(400).json({ message: 'Invalid leave type' });
        }

        const attendance = await Attendance.findById(id);
        if (!attendance) {
            return res.status(404).json({ message: 'Attendance record not found' });
        }

        // The employee's own working hours drive derived status / overtime below.
        const employeeDoc = await Employee.findById(attendance.employee);

        if (date) attendance.date = new Date(date);

        // A full leave when the status is 'leave' OR a leave type is given.
        // "None" full leave (status 'leave', no type) is unpaid → counts as LOP.
        const wantsLeave = status === 'leave' || !!leaveType;
        if (wantsLeave) {
            attendance.status = 'leave';
            attendance.leaveType = leaveType || undefined;   // "" / missing = None (unpaid)
            attendance.checkIn = null;
            attendance.checkOut = null;
            attendance.overtime = false;
            attendance.overtimeMinutes = 0;
            attendance.lop = 0;
        } else {
            // A worked day — clear any leave type and use the given/derived status.
            attendance.leaveType = undefined;
            if (checkIn !== undefined) attendance.checkIn = checkIn ? new Date(checkIn) : null;
            if (checkOut !== undefined) attendance.checkOut = checkOut ? new Date(checkOut) : null;
            attendance.status = status || deriveStatus(attendance.checkIn, employeeDoc);
            const { overtime, overtimeMinutes } = computeOvertime(attendance.checkOut, employeeDoc);
            attendance.overtime = overtime;
            attendance.overtimeMinutes = overtimeMinutes;
            if (lop !== undefined) attendance.lop = Number(lop) || 0;
        }

        // Pardon flag for the attendance LOP (kept for reference, not deducted).
        if (lopPardoned !== undefined) attendance.lopPardoned = Boolean(lopPardoned);
        
        if (wfhPardoned !== undefined) attendance.wfhPardoned = Boolean(wfhPardoned);

        await attendance.save();
        // Recalculate this month's salary from the updated attendance (LOP, gross,
        // actual/net pay, etc.) so salary stays in sync automatically.
        await syncSalary(attendance.employee, attendance.date);

        // Return the fully-populated record so the UI can show the saved values
        // immediately (employee + department), matching the list endpoint's shape.
        const populated = await Attendance.findById(attendance._id)
            .populate({ path: 'employee', populate: { path: 'department' } });
        return res.status(200).json({ message: 'Attendance updated successfully', attendance: populated });
    } catch (error) {
        return res.status(500).json({ message: 'Something went wrong', error: error.message });
    }
};

export const getAttendance = async (req, res) => {
    try {
        const { employee, date, month, year } = req.query;

        const filter = {};
        if (employee) {
            filter.employee = employee;
        }
        if (date) {
            // Daily report: attendance for one specific day.
            const { start, end } = getDayRange(date);
            filter.date = { $gte: start, $lte: end };
        } else if (month && year) {
            // Monthly report: all attendance within the chosen month.
            const m = Number(month), y = Number(year);
            const start = new Date(y, m - 1, 1, 0, 0, 0, 0);
            const end = new Date(y, m, 0, 23, 59, 59, 999);
            filter.date = { $gte: start, $lte: end };
        }

        const attendance = await Attendance.find(filter)
            .populate({ path: 'employee', populate: { path: 'department' } })
            .sort({ date: -1 });

        return res.status(200).json({ attendance, message: 'Attendance retrieved successfully' });
    } catch (error) {
        return res.status(500).json({ message: 'Something went wrong', error: error.message });
    }
};

export const getAttendanceSummary = async (req, res) => {
    try {
        const { employee } = req.query;

        const filter = {};
        if (employee) {
            filter.employee = employee;
        }

        const records = await Attendance.find(filter);

        const summary = {
            present: 0,
            absent: 0,
            late: 0,
            'half-day': 0,
            leave: 0,
        };

        records.forEach((record) => {
            summary[record.status] = summary[record.status] + 1;
        });

        return res.status(200).json({
            total: records.length,
            summary,
            message: 'Attendance summary retrieved successfully',
        });
    } catch (error) {
        return res.status(500).json({ message: 'Something went wrong', error: error.message });
    }
};

export const pardonWfhForMonth = async (req, res) => {
    try {
        const { employeeId, month, year } = req.body;
        if (!employeeId || !month || !year) {
            return res.status(400).json({ message: 'Missing required fields' });
        }
        
        const start = new Date(year, month - 1, 1, 0, 0, 0, 0);
        const end = new Date(year, month, 0, 23, 59, 59, 999);
        
        await Attendance.updateMany(
            { employee: employeeId, date: { $gte: start, $lte: end }, status: 'wfh' },
            { $set: { wfhPardoned: true } }
        );
        
        const updatedReport = await recalcSalaryForMonth(employeeId, year, month);
        
        res.status(200).json({ message: 'WFH pardoned successfully', report: updatedReport });
    } catch (error) {
        console.error("pardonWfhForMonth Error:", error);
        res.status(500).json({ message: 'Server Error' });
    }
};
