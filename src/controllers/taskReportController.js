import TaskReport from "../models/TaskReport.js";
import User from "../models/User.js";
import Employee from "../models/Employee.js";

// Resolve the Employee profile for the logged-in user from their JWT.
// The employee reference always comes from the token — never from the body.
const resolveOwnEmployee = async (req) => {
    const user = await User.findById(req.user.id).lean();
    if (!user) return { error: { status: 404, message: 'User not found' } };
    if (user.role !== 'employee') {
        return { error: { status: 403, message: 'Only employees can submit task reports' } };
    }
    const employee = await Employee.findOne({ email: user.email });
    if (!employee) return { error: { status: 404, message: 'Employee profile not found' } };
    return { employee };
};

const VALID_STATUS = ['completed', 'in-progress', 'pending'];

export const createTaskReport = async (req, res) => {
    try {
        const { title, description, date, status, file, fileName } = req.body;

        if (!title || !description) {
            return res.status(400).json({ message: 'Title and description are required' });
        }

        const reportStatus = status || 'pending';
        if (!VALID_STATUS.includes(reportStatus)) {
            return res.status(400).json({ message: 'Invalid status value' });
        }

        // Employee is taken from the JWT, not from the request body.
        const { employee, error } = await resolveOwnEmployee(req);
        if (error) return res.status(error.status).json({ message: error.message });

        const taskReport = await TaskReport.create({
            employee: employee._id,
            title,
            description,
            date: date ? new Date(date) : new Date(),
            status: reportStatus,
            file: file || undefined,
            fileName: fileName || undefined,
        });

        return res.status(201).json({ message: 'Task report submitted successfully', taskReport });
    } catch (error) {
        return res.status(500).json({ message: 'Something went wrong', error: error.message });
    }
};

export const verifyTaskReport = async (req, res) => {
    try {
        // Only admins can verify task reports. The role comes from the JWT.
        if (req.user.role !== 'admin') {
            return res.status(403).json({ message: 'Only admins can verify task reports' });
        }

        const { id } = req.params;
        const taskReport = await TaskReport.findByIdAndUpdate(
            id,
            { verified: true, verifiedAt: new Date() },
            { new: true }
        ).populate({ path: 'employee', populate: { path: 'department' } });

        if (!taskReport) {
            return res.status(404).json({ message: 'Task report not found' });
        }

        return res.status(200).json({ message: 'Task report verified successfully', taskReport });
    } catch (error) {
        return res.status(500).json({ message: 'Something went wrong', error: error.message });
    }
};

export const getTaskReports = async (req, res) => {
    try {
        const user = await User.findById(req.user.id).lean();
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        const filter = {};

        if (user.role === 'employee') {
            // Employees can only ever see their own reports.
            const employee = await Employee.findOne({ email: user.email });
            if (!employee) {
                return res.status(404).json({ message: 'Employee profile not found' });
            }
            filter.employee = employee._id;
        } else if (req.query.employee) {
            // Admins see everything, but may optionally filter by one employee.
            filter.employee = req.query.employee;
        }

        const taskReports = await TaskReport.find(filter)
            .populate({ path: 'employee', populate: { path: 'department' } })
            .sort({ date: -1, createdAt: -1 });

        return res.status(200).json({ taskReports, message: 'Task reports retrieved successfully' });
    } catch (error) {
        return res.status(500).json({ message: 'Something went wrong', error: error.message });
    }
};
