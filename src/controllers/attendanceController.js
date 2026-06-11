// Attendance controller.
// Handles: list attendance records, mark attendance, attendance summary, check-in.

import Attendance from "../models/Attendance.js";
import User from "../models/User.js";
import Employee from "../models/Employee.js";

const getDayRange = (date) => {
    const start = new Date(date);
    start.setHours(0, 0, 0, 0);
    const end = new Date(date);
    end.setHours(23, 59, 59, 999);
    return { start, end };
};

// Distance in meters between two lat/lng points (Haversine formula).
const distanceInMeters = (lat1, lng1, lat2, lng2) => {
    const R = 6371000; // Earth's radius in meters
    const toRad = (deg) => (deg * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

// POST /api/attendance/checkin
// Employee checks in with their live GPS location + a selfie.
// Allowed only within the office radius, once per day.
export const checkIn = async (req, res) => {
    try {
        const { latitude, longitude, image } = req.body;
        if (latitude == null || longitude == null || !image) {
            return res.status(400).json({ message: 'Location and selfie are required' });
        }

        // The token only holds the user id/role, so resolve the Employee from the
        // logged-in user (by email). This stops anyone checking in as someone else.
        const user = await User.findById(req.user.id).lean();
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }
        const employee = await Employee.findOne({ email: user.email });
        if (!employee) {
            return res.status(404).json({ message: 'Employee profile not found' });
        }

        // Office location + allowed radius come from the .env file.
        const officeLat = parseFloat(process.env.OFFICE_LAT);
        const officeLng = parseFloat(process.env.OFFICE_LNG);
        const radius = parseFloat(process.env.OFFICE_RADIUS || '200');
        if (Number.isNaN(officeLat) || Number.isNaN(officeLng)) {
            return res.status(500).json({ message: 'Office location is not configured' });
        }

        // Reject if the employee is too far from the office.
        const distance = distanceInMeters(latitude, longitude, officeLat, officeLng);
        if (distance > radius) {
            return res.status(403).json({
                message: `You are about ${Math.round(distance)}m from the office. Check-in is allowed within ${radius}m.`,
            });
        }

        // Only one check-in per day per employee.
        const { start, end } = getDayRange(new Date());
        const existing = await Attendance.findOne({
            employee: employee._id,
            date: { $gte: start, $lte: end },
        });
        if (existing) {
            return res.status(400).json({ message: 'You have already checked in today' });
        }

        const now = new Date();

        // Decide the status from the check-in time (server local time):
        //   before 9:00 AM        -> present
        //   9:00 AM to 12:29 PM   -> late
        //   12:30 PM or later      -> half-day
        const minutesOfDay = now.getHours() * 60 + now.getMinutes();
        let status;
        if (minutesOfDay < 9 * 60) {
            status = 'present';
        } else if (minutesOfDay < 12 * 60 + 30) {
            status = 'late';
        } else {
            status = 'half-day';
        }

        const attendance = await Attendance.create({
            employee: employee._id,
            date: now,
            checkIn: now,
            status,
            latitude,
            longitude,
            image,
        });

        return res.status(201).json({ message: `Check-in successful (${status})`, attendance });
    } catch (error) {
        return res.status(500).json({ message: 'Something went wrong', error: error.message });
    }
};

// POST /api/attendance/checkout
// Employee checks out (must have checked in today). Captures GPS + selfie again.
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

        const officeLat = parseFloat(process.env.OFFICE_LAT);
        const officeLng = parseFloat(process.env.OFFICE_LNG);
        const radius = parseFloat(process.env.OFFICE_RADIUS || '200');
        if (Number.isNaN(officeLat) || Number.isNaN(officeLng)) {
            return res.status(500).json({ message: 'Office location is not configured' });
        }

        const distance = distanceInMeters(latitude, longitude, officeLat, officeLng);
        if (distance > radius) {
            return res.status(403).json({
                message: `You are about ${Math.round(distance)}m from the office. Check-out is allowed within ${radius}m.`,
            });
        }

        // Must have a check-in record for today.
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

        // Overtime if checking out after 6:00 PM (server local time).
        const minutesOfDay = checkOutTime.getHours() * 60 + checkOutTime.getMinutes();
        const sixPm = 18 * 60;
        const overtime = minutesOfDay > sixPm;
        const overtimeMinutes = overtime ? minutesOfDay - sixPm : 0;

        attendance.checkOut = checkOutTime;
        attendance.checkOutLatitude = latitude;
        attendance.checkOutLongitude = longitude;
        attendance.checkOutImage = image;
        attendance.overtime = overtime;
        attendance.overtimeMinutes = overtimeMinutes;
        await attendance.save();

        const note = overtime ? ` (overtime: ${overtimeMinutes} min)` : '';
        return res.status(200).json({ message: `Check-out successful${note}`, attendance });
    } catch (error) {
        return res.status(500).json({ message: 'Something went wrong', error: error.message });
    }
};

// POST /api/attendance

export const markAttendance = async (req, res) => {
    try {
        const { employee, date, checkIn, checkOut, status } = req.body;

        if (!employee || !status) {
            return res.status(400).json({ message: 'Employee and status are required' });
        }

        const validStatus = ['present', 'absent', 'late', 'half-day', 'leave'];
        if (!validStatus.includes(status)) {
            return res.status(400).json({ message: 'Invalid status value' });
        }

        // Default the date to today if it wasn't provided.
        const attendanceDate = date ? new Date(date) : new Date();

        // Stop the same employee from being marked twice on the same day.
        const { start, end } = getDayRange(attendanceDate);
        const existing = await Attendance.findOne({
            employee,
            date: { $gte: start, $lte: end },
        });
        if (existing) {
            return res.status(400).json({ message: 'Attendance already marked for this day' });
        }

        const attendance = await Attendance.create({
            employee,
            date: attendanceDate,
            checkIn,
            checkOut,
            status,
        });

        return res.status(201).json({ message: 'Attendance marked successfully', attendance });
    } catch (error) {
        return res.status(500).json({ message: 'Something went wrong', error: error.message });
    }
};


export const getAttendance = async (req, res) => {
    try {
        const { employee, date } = req.query;

        const filter = {};
        if (employee) {
            filter.employee = employee;
        }
        if (date) {
            const { start, end } = getDayRange(date);
            filter.date = { $gte: start, $lte: end };
        }

        const attendance = await Attendance.find(filter)
            // also populate the employee's department so the UI can show it
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

        // Start every status at 0 so the response shape is always the same.
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
