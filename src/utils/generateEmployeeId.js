import Employee from '../models/Employee.js';

const generateEmployeeId = async () => {
    const lastEmployee = await Employee.findOne().sort({ empId: -1 });

    let nextNumber = 1;

    if (lastEmployee && lastEmployee.empId) {
        const lastNumber = parseInt(lastEmployee.empId.replace('EMP', ''), 10);
        nextNumber = lastNumber + 1;
    }

    const paddedNumber = String(nextNumber).padStart(3, '0');

    return `EMP${paddedNumber}`;
};

export default generateEmployeeId;
