// Generate the next unique employee id (EMP001, EMP002, EMP003 ...).
import Employee from '../models/Employee.js';

const generateEmployeeId = async () => {
    // Get the most recent employee (the one with the highest empId).
    const lastEmployee = await Employee.findOne().sort({ empId: -1 });

    // If there are no employees yet, start at 1.
    let nextNumber = 1;

    if (lastEmployee && lastEmployee.empId) {
        // Take the number part after "EMP" and turn it into a number.
        const lastNumber = parseInt(lastEmployee.empId.replace('EMP', ''), 10);
        nextNumber = lastNumber + 1;
    }

    // Pad the number to 3 digits, e.g. 1 -> "001", 25 -> "025".
    const paddedNumber = String(nextNumber).padStart(3, '0');

    return `EMP${paddedNumber}`;
};

export default generateEmployeeId;
