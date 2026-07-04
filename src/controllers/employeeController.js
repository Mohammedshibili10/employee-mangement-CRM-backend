import bcrypt from "bcryptjs";
import Employee from "../models/Employee.js";
import User from "../models/User.js";
import generateEmployeeId from "../utils/generateEmployeeId.js";

export const createEmployee = async (req, res) => {
    try{
        const { name, email, department,phoneNumber,designation,joiningDate,status,password, empId: providedEmpId } = req.body;
        if(!name || !email || !department || !phoneNumber || !designation || !joiningDate){
            return res.status(400).json({ message: 'All fields are required' });
        }

        // New employees get a fixed default password (they can change it after login).
        const DEFAULT_PASSWORD = 'Welcome@123';
        const rawPassword =
            password && String(password).trim().length >= 6 ? String(password) : DEFAULT_PASSWORD;

            const existingEmployee = await Employee.findOne({ $or: [{ email }, { phone: phoneNumber }] });
            if (existingEmployee) {
                return res.status(400).json({ message: 'Employee with this email or phone number already exists' });
            }

            const existingUser = await User.findOne({ email });
            if (existingUser) {
                return res.status(400).json({ message: 'A login account with this email already exists' });
            }

        // Use the admin-provided Employee ID when given; otherwise auto-generate.
        const empId = providedEmpId && String(providedEmpId).trim()
            ? String(providedEmpId).trim()
            : await generateEmployeeId();

        const existingId = await Employee.findOne({ empId });
        if (existingId) {
            return res.status(400).json({ message: 'This Employee ID is already in use' });
        }

        const employee = await Employee.create({
            ...req.body,
            empId,
            phone: phoneNumber,
            onboarding: {
                created: true,
                idGenerated: true,
                whatsappSent: false,
                firstLogin: false,
                profileCompleted: false,
            },
        });

        const hashedPassword = await bcrypt.hash(rawPassword, 10);
        await User.create({
            name,
            email,
            password: hashedPassword,
            role: 'employee',
        });

        return res.status(201).json({ message: 'Employee created successfully', employee });
    } catch (error) {
        return res.status(500).json({ message: 'Something went wrong', error: error.message });
    }
}

export const getEmployees = async (req, res) => {
    try{
        const employees = await Employee.find().populate('department');
        return res.status(200).json({ employees, message: 'Employees retrieved successfully' });
    } catch (error) {
        return res.status(500).json({ message: 'Something went wrong', error: error.message });
    }
}

export const getEmployee = async (req, res) => {
    try{
        const {id} = req.params;
        const employee = await Employee.findById(id).populate('department').lean();
        if(!employee){
            return res.status(404).json({ message: 'Employee not found' });
        }
        const onboarding = {
            created: true,
            idGenerated: !!employee.empId,
            whatsappSent: employee.whatsappSent || employee.onboarding?.whatsappSent || false,
            firstLogin: employee.onboarding?.firstLogin || false,
            profileCompleted: employee.onboarding?.profileCompleted || false,
        };
        return res.status(200).json({ employee: { ...employee, onboarding }, message: 'Employee retrieved successfully' });
    } catch (error) {
        return res.status(500).json({ message: 'Something went wrong', error: error.message });
    }
    }

    export const updateEmployee = async (req, res) => {
        try{
            const {id} = req.params;
            const { name, email, department, phoneNumber, phone, designation, joiningDate, status, salary } = req.body;
            // The form sends the phone as `phoneNumber`; accept plain `phone` too.
            const phoneValue = phoneNumber ?? phone;
            if(!name || !email || !department || !phoneValue || !designation || !joiningDate){
                return res.status(400).json({ message: 'All fields are required' });
            }

            const existing = await Employee.findById(id);
            if(!existing){
                return res.status(404).json({ message: 'Employee not found' });
            }

            // Don't let the edit reuse an email/phone that belongs to a DIFFERENT employee.
            const clash = await Employee.findOne({
                _id: { $ne: id },
                $or: [{ email }, { phone: phoneValue }],
            });
            if(clash){
                return res.status(400).json({ message: 'Another employee already uses this email or phone number' });
            }

            // Build the update explicitly so every field maps to the schema
            // (phoneNumber -> phone) and unknown/stray fields are never written.
            const update = { name, email, department, phone: phoneValue, designation, joiningDate };
            if(status !== undefined) update.status = status;
            if(salary !== undefined) update.salary = Number(salary) || 0;

            const employee = await Employee.findByIdAndUpdate(id, update, { returnDocument: 'after', runValidators: true })
                .populate('department');

            // Keep the linked login account in sync when name/email change, else the
            // employee could no longer sign in or load their own profile.
            if(existing.email !== email || existing.name !== name){
                await User.updateOne({ email: existing.email, role: 'employee' }, { name, email });
            }

            return res.status(200).json({ message: 'Employee updated successfully', employee });
        } catch (error) {
            return res.status(500).json({ message: 'Something went wrong', error: error.message });
        }
    }

export const deleteEmployee = async (req, res) => {
    try{
        const {id}= req.params;
        const employee = await Employee.findByIdAndDelete(id);
        if(!employee){
            return res.status(404).json({ message: 'Employee not found' });
        }
        return res.status(200).json({ message: 'Employee deleted successfully' });
    } catch (error) {
        return res.status(500).json({ message: 'Something went wrong', error: error.message });
    }
}

export  const getOnboardingStatus = async (req, res) => {
    try{
        const {id}=req.params;
        const employee = await Employee.findById(id);
        if(!employee){
            return res.status(404).json({ message: 'Employee not found' });
        }
        return res.status(200).json({ onboardingStatus: employee.onboarding, message: 'Onboarding status retrieved successfully' });
    } catch (error) {
        return res.status(500).json({ message: 'Something went wrong', error: error.message });
    }
}

const resolveOwnEmployee = async (req) => {
    const user = await User.findById(req.user.id).lean();
    if (!user) return { error: { status: 404, message: 'User not found' } };
    if (user.role !== 'employee') {
        return { error: { status: 403, message: 'Only employees can manage a profile photo' } };
    }
    const employee = await Employee.findOne({ email: user.email });
    if (!employee) return { error: { status: 404, message: 'Employee profile not found' } };
    return { employee };
};

export const updateMyPhoto = async (req, res) => {
    try {
        const { image } = req.body;
        if (!image) {
            return res.status(400).json({ message: 'Image is required' });
        }
        const { employee, error } = await resolveOwnEmployee(req);
        if (error) return res.status(error.status).json({ message: error.message });

        employee.profilePhoto = image;
        await employee.save();
        return res.status(200).json({ message: 'Profile photo updated', profilePhoto: employee.profilePhoto });
    } catch (error) {
        return res.status(500).json({ message: 'Something went wrong', error: error.message });
    }
};

export const deleteMyPhoto = async (req, res) => {
    try {
        const { employee, error } = await resolveOwnEmployee(req);
        if (error) return res.status(error.status).json({ message: error.message });

        employee.profilePhoto = null;
        await employee.save();
        return res.status(200).json({ message: 'Profile photo removed' });
    } catch (error) {
        return res.status(500).json({ message: 'Something went wrong', error: error.message });
    }
};
