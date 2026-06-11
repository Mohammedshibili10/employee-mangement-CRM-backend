import bcrypt from "bcryptjs";
import Employee from "../models/Employee.js";
import User from "../models/User.js";
import generateEmployeeId from "../utils/generateEmployeeId.js";
import { sendWhatsAppMessage } from "../utils/sendWhatsApp.js";

export const createEmployee = async (req, res) => {
    try{
        const { name, email, department,phoneNumber,designation,joiningDate,status,password,sendWhatsApp } = req.body;
        if(!name || !email || !department || !phoneNumber || !designation || !joiningDate || !password){
            return res.status(400).json({ message: 'All fields are required' });
        }

            const existingEmployee = await Employee.findOne({ $or: [{ email }, { phone: phoneNumber }] });
            if (existingEmployee) {
                return res.status(400).json({ message: 'Employee with this email or phone number already exists' });
            }

            const existingUser = await User.findOne({ email });
            if (existingUser) {
                return res.status(400).json({ message: 'A login account with this email already exists' });
            }

        const empId = await generateEmployeeId();

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

        const hashedPassword = await bcrypt.hash(password, 10);
        await User.create({
            name,
            email,
            password: hashedPassword,
            role: 'employee',
        });

        if (sendWhatsApp !== false) {
            const whatsappSent = await sendWhatsAppMessage(employee.phone, employee.name);
            if (whatsappSent) {
                employee.whatsappSent = true;
                employee.onboarding.whatsappSent = true;
                await employee.save();
            }
        }

        return res.status(201).json({ message: 'Employee created successfully', employee: employee });
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
            const { name, email, department,phoneNumber,designation,joiningDate,status } = req.body;
            if(!name || !email || !department || !phoneNumber || !designation || !joiningDate){
                return res.status(400).json({ message: 'All fields are required' });
            }

            const { profilePhoto, ...updatable } = req.body;
            const employee =await Employee.findByIdAndUpdate(id,updatable,{ new: true });
            if(!employee){
                return res.status(404).json({ message: 'Employee not found' });
            }
            return res.status(200).json({ message: 'Employee updated successfully', employee: employee });
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
