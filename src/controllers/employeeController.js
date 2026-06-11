
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
            // The employee now exists and has an ID, so mark those onboarding steps done.
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

        // Send the WhatsApp invitation only if the admin asked for it (default yes).
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
        // Derive the onboarding status from real facts so it's always correct,
        // even for older records whose stored flags were never set.
        const onboarding = {
            created: true,                                   // the record exists
            idGenerated: !!employee.empId,                   // it has an employee ID
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
            const employee =await Employee.findByIdAndUpdate(id,req.body,{ new: true });
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

