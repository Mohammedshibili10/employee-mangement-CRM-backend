import Attendance from "../models/Attendance.js";
import Employee from "../models/Employee.js";

export const getEmployeeReport = async (req, res) => {
    try{
        // Matches the rest of the system: inactive employees are hidden unless
        // they are explicitly asked for.
        const includeInactive = String(req.query.includeInactive) === 'true';
        const employees = await Employee.find(includeInactive ? {} : { status: 'active' }).populate('department');
        return res.status(200).json({ employees, message: 'Employee report retrieved successfully' });
    } catch (error) {
        return res.status(500).json({ message: 'Something went wrong', error: error.message });
    }
}

export const getAttendanceReport = async (req, res) => {
    try{
        const attendanceRecords = await Attendance.find().populate({ path: 'employee', populate: { path: 'department' } });
        return res.status(200).json({ attendanceRecords, message: 'Attendance report retrieved successfully' });
    } catch (error) {
        return res.status(500).json({ message: 'Something went wrong', error: error.message });
    }
}
