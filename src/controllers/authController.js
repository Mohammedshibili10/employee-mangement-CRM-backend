import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import Employee from '../models/Employee.js';

export const login = async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ message: 'Email and password are required' });
        }

        const user = await User.findOne({ email });
        if (!user) {
            return res.status(401).json({ message: 'Invalid email or password' });
        }

        const passwordMatches = await bcrypt.compare(password, user.password);
        if (!passwordMatches) {
            return res.status(401).json({ message: 'Invalid email or password' });
        }

        if (user.role === 'employee') {
            await Employee.updateOne({ email: user.email }, { 'onboarding.firstLogin': true });
        }

        const token = jwt.sign(
            { id: user._id, role: user.role },
            process.env.JWT_SECRET,
            { expiresIn: '30d' }
        );

        return res.status(200).json({
            token,
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                role: user.role
            }
        });
    } catch (error) {
        return res.status(500).json({ message: 'Something went wrong', error: error.message });
    }
};

export const logout = (req, res) => {

    res.status(200).json({ message: 'Logged out successfully' });
}

export const getMe = async (req, res) => {
    try {

        const user = await User.findById(req.user.id).select('-password').lean();
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        const profile = {
            id: user._id,
            name: user.name,
            email: user.email,
            role: user.role,
        };

        if (user.role === 'employee') {
            const employee = await Employee.findOne({ email: user.email })
                .populate('department')
                .lean();
            if (employee) {
                profile.employeeId = employee._id;
                profile.empId = employee.empId;
                profile.designation = employee.designation;
                profile.department = employee.department ? employee.department.name : null;
                profile.phone = employee.phone;
                profile.joiningDate = employee.joiningDate;
                profile.status = employee.status;
                profile.profilePhoto = employee.profilePhoto || null;
            }
        }

        return res.status(200).json({ user: profile });
    } catch (error) {
        return res.status(500).json({ message: 'Something went wrong', error: error.message });
    }
};

export const updateProfile = async (req, res) => {
    try {
        const { name, email } = req.body;
        const user = await User.findById(req.user.id);
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        if (name !== undefined) {
            if (!name.trim() || name.trim().length < 2) {
                return res.status(400).json({ message: 'Name must be at least 2 characters' });
            }
            user.name = name.trim();
        }

        if (email !== undefined && email.trim() !== user.email) {
            const clean = email.trim().toLowerCase();
            const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRe.test(clean)) {
                return res.status(400).json({ message: 'Invalid email format' });
            }
            const taken = await User.findOne({ email: clean, _id: { $ne: user._id } });
            if (taken) {
                return res.status(409).json({ message: 'That email is already in use' });
            }
            user.email = clean;
        }

        await user.save();
        return res.status(200).json({
            message: 'Profile updated successfully',
            user: { id: user._id, name: user.name, email: user.email, role: user.role },
        });
    } catch (error) {
        return res.status(500).json({ message: 'Something went wrong', error: error.message });
    }
};

export const changePassword = async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;
        if (!currentPassword || !newPassword) {
            return res.status(400).json({ message: 'Current and new password are required' });
        }
        if (newPassword.length < 6) {
            return res.status(400).json({ message: 'New password must be at least 6 characters' });
        }

        const user = await User.findById(req.user.id);
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        const matches = await bcrypt.compare(currentPassword, user.password);
        if (!matches) {
            return res.status(401).json({ message: 'Current password is incorrect' });
        }

        user.password = await bcrypt.hash(newPassword, 10);
        await user.save();

        return res.status(200).json({ message: 'Password changed successfully' });
    } catch (error) {
        return res.status(500).json({ message: 'Something went wrong', error: error.message });
    }
};
