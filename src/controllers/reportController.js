import Attendance from "../models/Attendance.js";
import Leave from "../models/Leave.js";
import Employee from "../models/Employee.js";

export const getEmployeeReport = async (req, res) => {
    try{
        const employees = await Employee.find().populate('department');
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

export const getLeaveReport = async (req, res) => {
    try{
        const leaveRecords = await Leave.find().populate('employee');
        return res.status(200).json({ leaveRecords, message: 'Leave report retrieved successfully' });
    } catch (error) {
        return res.status(500).json({ message: 'Something went wrong', error: error.message });
    }
}
