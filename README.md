# Employee Management CRM — Backend

Folder structure scaffold only (no logic implemented yet).
Planned stack: Node.js + Express + MongoDB (Mongoose) + JWT auth.

## Folder structure

```bash
backend/
├── src/
│   ├── config/
│   │   └── db.js                 # database connection
│   ├── controllers/              # request handlers (the logic)
│   │   ├── authController.js
│   │   ├── employeeController.js
│   │   ├── departmentController.js
│   │   ├── attendanceController.js
│   │   ├── leaveController.js
│   │   └── reportController.js
│   ├── models/                   # database schemas
│   │   ├── User.js
│   │   ├── Employee.js
│   │   ├── Department.js
│   │   ├── Attendance.js
│   │   └── Leave.js
│   ├── routes/                   # API endpoints
│   │   ├── authRoutes.js
│   │   ├── employeeRoutes.js
│   │   ├── departmentRoutes.js
│   │   ├── attendanceRoutes.js
│   │   ├── leaveRoutes.js
│   │   └── reportRoutes.js
│   ├── middleware/
│   │   ├── authMiddleware.js     # protect routes with JWT
│   │   └── errorMiddleware.js    # central error handler
│   ├── utils/
│   │   ├── generateEmployeeId.js # EMP001, EMP002 ...
│   │   └── sendWhatsApp.js       # WhatsApp invitation
│   ├── app.js                    # express app + middleware + routes
│   └── server.js                 # entry point
├── .env.example
├── .gitignore
└── package.json
```

## Next steps (when you start building)

1. `cd backend` then `npm install express mongoose dotenv cors jsonwebtoken bcryptjs`
2. `npm install -D nodemon`
3. Copy `.env.example` to `.env` and fill in the values.
4. Fill in the `// TODO` stubs in each file.
5. `npm run dev`
