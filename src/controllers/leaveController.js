
import Leave from "../models/Leave.js";

export const applyLeave = async (req, res) => {
    try{
        // The Leave model uses type/from/to (not startDate/endDate).
        const { employee, type, from, to, reason } = req.body;
        if(!employee || !type || !from || !to || !reason){
            return res.status(400).json({ message: 'All fields are required' });
        }
        const leave = await Leave.create({ employee, type, from, to, reason });
        return res.status(201).json({ message: 'Leave applied successfully', leave: leave });
    } catch (error) {
        return res.status(500).json({ message: 'Something went wrong', error: error.message });
    }
}

export const getLeaves = async (req, res) => {
    try{
        // Optional ?employee=<id> filter so an employee can see only their own leaves.
        const { employee } = req.query;
        const filter = employee ? { employee } : {};
        const leaves = await Leave.find(filter).populate('employee');
        return res.status(200).json({ leaves, message: 'Leaves retrieved successfully' });
    } catch (error) {
        return res.status(500).json({ message: 'Something went wrong', error: error.message });
    }
}

export const approveLeave = async (req, res) => {
    try{
        const { id } = req.params;
        const leave = await Leave.findByIdAndUpdate(id, { status: 'approved' }, { new: true });
        if(!leave){
            return res.status(404).json({ message: 'Leave request not found' });
        }
        return res.status(200).json({ message: 'Leave approved successfully', leave: leave });
    } catch (error) {
        return res.status(500).json({ message: 'Something went wrong', error: error.message });
    }
}

export const rejectLeave = async (req, res) => {
    try{
        const { id } = req.params;
        const leave = await Leave.findByIdAndUpdate(id, { status: 'rejected' }, { new: true });
        if(!leave){
            return res.status(404).json({ message: 'Leave request not found' });
        }
        return res.status(200).json({ message: 'Leave rejected successfully', leave: leave });
    } catch (error) {
        return res.status(500).json({ message: 'Something went wrong', error: error.message });
    }
}

export const statusLeave = async (req, res) => {
    try{
        const { id } = req.params;
        const { status } = req.body;
        if(!['pending', 'approved', 'rejected'].includes(status)){
            return res.status(400).json({ message: 'Invalid status value' });
        }
        const leave = await Leave.findByIdAndUpdate(id, { status }, { new: true });
        if(!leave){
            return res.status(404).json({ message: 'Leave request not found' });
        }
        return res.status(200).json({ message: `Leave ${status} successfully`, leave: leave });
    } catch (error) {
        return res.status(500).json({ message: 'Something went wrong', error: error.message });
    }
}

