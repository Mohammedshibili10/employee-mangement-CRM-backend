import Department from "../models/Department.js";

export const createDepartment =async (req, res) => {
    try {
    const { name, head } = req.body;
    if(!name || !head){
        return res.status(400).json({ message: 'All fields are required' });
    }
    const department =await Department.create({ name, head });
    return res.status(201).json({ message: 'Department created successfully', department: department });
} catch (error) {
    return res.status(500).json({ message: 'Something went wrong', error: error.message });
}

}

export const getDepartments = async (req, res) => {
    try {
        const departments = await Department.find();
        return res.status(200).json({ departments, message: 'Departments retrieved successfully' });

    }catch (error) {
        return res.status(500).json({ message: 'Something went wrong', error: error.message });
    }
}

export const updateDepartment = async (req, res) => {
    try{
        const { id } = req.params
        const { name, head } = req.body;

         if(!name || !head){
            return res.status(400).json({ message: 'All fields are required' });
        }
        const department =await Department.findByIdAndUpdate(id, { name, head }, { new: true });
        if(!department){
            return res.status(404).json({ message: 'Department not found' });
        }
        return res.status(200).json({ message: 'Department updated successfully', department: department });
    } catch (error) {
        return res.status(500).json({ message: 'Something went wrong', error: error.message });
    }
}

export const deleteDepartment = async (req, res) => {
    try{
        const {id}= req.params;
        const department = await Department.findByIdAndDelete(id);
        if(!department){
            return res.status(404).json({ message: 'Department not found' });
        }
        return res.status(200).json({ message: 'Department deleted successfully' });
    } catch (error) {
        return res.status(500).json({ message: 'Something went wrong', error: error.message });
    }
}
