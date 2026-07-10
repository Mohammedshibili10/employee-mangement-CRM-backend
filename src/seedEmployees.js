import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import Employee from './models/Employee.js';
import User from './models/User.js';
import Department from './models/Department.js';

dotenv.config();

// Roster to import. Departments are normalised to a small canonical set; blank
// designations default to "Staff". Email/phone/joiningDate are not in the source
// list, so safe placeholders are generated (admin can edit them later).
const EMPLOYEES = [
    { empId: 'RAC002E', name: 'MUHAMMED MUJADDID K K', dept: 'Legal', designation: 'LEGAL AND DOCUMNETATION OFFICER' },
    { empId: 'RAC003E', name: 'VISMAYA T', dept: 'Sales', designation: 'IP ADVISOR' },
    { empId: 'RAC004E', name: 'MUHAMMED AJMAL K P', dept: 'General', designation: 'SITE SUPERVISOR' },
    { empId: 'RAC008E', name: 'NABEEL ALI', dept: 'Sales', designation: 'IP ADVISOR' },
    { empId: 'RAC010E', name: 'AMALRAJ S', dept: 'Sales', designation: 'DATA ANALYST' },
    { empId: 'RAC013E', name: 'RESHMA P A', dept: 'General', designation: 'Staff' },
    { empId: 'RAC014E', name: 'MOHAMMED ADIL T', dept: 'General', designation: 'Staff' },
    { empId: 'RAC017E', name: 'MUHAMMED SHAFEEQ PC', dept: 'General', designation: 'Staff' },
    { empId: 'RAC019I', name: 'JANNA FATHIMA', dept: 'General', designation: 'Staff' },
    { empId: 'RAC020I', name: 'FATHIMA HARSHANA', dept: 'General', designation: 'Staff' },
    { empId: 'RAC027E', name: 'JASIRA MOIDEEN', dept: 'Sales', designation: 'HEAD OS SALES' },
    { empId: 'RAC030E', name: 'HANNA .V K', dept: 'Sales', designation: 'BDE' },
    { empId: 'RAC028E', name: 'VIPIN VK', dept: 'Operations', designation: 'HEAD OF OPERATIONS FOUNDERS OFFICE' },
    { empId: 'RAC029E', name: 'ADARSH .EM', dept: 'Operations', designation: 'START UP INTAKE COORDINATOR' },
    { empId: 'RAC031E', name: 'JINCY K', dept: 'General', designation: 'Staff' },
    { empId: 'RAC033E', name: 'AHMED ZENHER PM', dept: 'Sales', designation: 'IP ADVISOR' },
    { empId: 'RAC034E', name: 'CHAITHRA MK', dept: 'Sales', designation: 'IP ADVISOR' },
    { empId: 'RAC035I', name: 'AYISHA ASFIYA P', dept: 'General', designation: 'Staff' },
    { empId: 'RAC037E', name: 'MUHAMMED SHHABAS P', dept: 'Sales', designation: 'IP ADVISOR' },
    { empId: 'RAC038E', name: 'RAJATH S', dept: 'Operations', designation: 'OPERATIONS MANAGER' },
    { empId: 'RAC039E', name: 'NICY VINCENT', dept: 'Operations', designation: 'FRONT OFFICE MANAGER' },
    { empId: 'RAC040E', name: 'VYSHNAV C', dept: 'Sales', designation: 'IP ADVISOR' },
    { empId: 'RAC041E', name: 'MOHAMMED SHIBILI E K', dept: 'IT', designation: 'JUNIOR DEVELOPER' },
    { empId: 'RAC042E', name: 'AMAN AGMAL KK', dept: 'Sales', designation: 'IP ADVISOR' },
];

const DEFAULT_PASSWORD = 'Welcome@123';
const emailFor = (empId) => `${empId.toLowerCase()}@racpartners.in`;
// Deterministic, unique placeholder phone from the empId's number (e.g. RAC003E -> 9000000003).
const phoneFor = (empId) => '90000' + String(parseInt(empId.replace(/\D/g, ''), 10) || 0).padStart(5, '0');

const seedEmployees = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('MongoDB connected\n');

        // Find-or-create each department once, cached by name.
        const deptCache = {};
        const getDeptId = async (name) => {
            if (deptCache[name]) return deptCache[name];
            let dept = await Department.findOne({ name });
            if (!dept) {
                dept = await Department.create({ name, head: 'TBD' });
                console.log(`  + created department "${name}"`);
            }
            deptCache[name] = dept._id;
            return dept._id;
        };

        const hashedPassword = await bcrypt.hash(DEFAULT_PASSWORD, 10);
        let created = 0, skipped = 0, failed = 0;

        for (const emp of EMPLOYEES) {
            try {
                // Duplicate prevention: skip if the Employee ID already exists.
                const existing = await Employee.findOne({ empId: emp.empId });
                if (existing) {
                    console.log(`- skip ${emp.empId} ${emp.name} (already exists)`);
                    skipped++;
                    continue;
                }

                const email = emailFor(emp.empId);
                const phone = phoneFor(emp.empId);
                const departmentId = await getDeptId(emp.dept);

                await Employee.create({
                    empId: emp.empId,
                    name: emp.name,
                    email,
                    phone,
                    department: departmentId,
                    designation: emp.designation || 'Staff',
                    salary: 0,
                    joiningDate: new Date(),
                    status: 'active',
                    onboarding: { created: true, idGenerated: true, whatsappSent: false, firstLogin: false, profileCompleted: false },
                });

                // Create the matching login account (unless one already uses this email).
                const existingUser = await User.findOne({ email });
                if (!existingUser) {
                    await User.create({ name: emp.name, email, password: hashedPassword, role: 'employee' });
                }

                console.log(`+ created ${emp.empId} ${emp.name} (${emp.dept} / ${emp.designation || 'Staff'}) — ${email}`);
                created++;
            } catch (err) {
                console.log(`! failed ${emp.empId} ${emp.name}: ${err.message}`);
                failed++;
            }
        }

        console.log(`\nDone. Created: ${created}, Skipped (already existed): ${skipped}, Failed: ${failed}`);
        console.log(`Default login password for new employees: ${DEFAULT_PASSWORD}`);
    } catch (error) {
        console.error('Failed to seed employees:', error.message);
    } finally {
        await mongoose.connection.close();
        process.exit();
    }
};

seedEmployees();
