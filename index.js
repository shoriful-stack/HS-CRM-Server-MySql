require('dotenv').config();

const express = require('express');
const cors = require('cors');
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const app = express();
const port = process.env.PORT || 3000;

// Middlewares
app.use(cors());
app.use(express.json());  // To parse JSON request bodies

// Create a MySQL connection pool for better performance and handling multiple requests
const pool = mysql.createPool({
    connectionLimit: 10, // Adjust based on your needs
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,  // Ensure you have DB_PASSWORD in your .env
    database: process.env.DB_NAME,
    port: process.env.DB_PORT || 3306, // Default MySQL port
    waitForConnections: true,
    queueLimit: 0
});


// POST route to add an employee
app.post('/employees', async (req, res) => {
    const { employee_name, department_name, designation, employee_phone, employee_email, employee_uid, employee_pass } = req.body;

    // Validation: Ensure all required fields are provided
    if (!employee_name || !department_name || !designation || !employee_phone || !employee_email || !employee_uid || !employee_pass) {
        return res.status(400).json({ message: "All fields are required" });
    }

    try {
        // Hash the employee_pass before saving to the database
        const hash = await bcrypt.genSalt(10);
        const hashedPass = await bcrypt.hash(employee_pass, hash);

        // Insert employee data with the hashed password into the employees table
        const insertQuery = `
            INSERT INTO employees 
            (employee_name, department_name, designation, employee_phone, employee_email, employee_uid, employee_pass) 
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `;

        const [result] = await pool.query(insertQuery, [
            employee_name,
            department_name,
            designation,
            employee_phone.trim(),
            employee_email.trim(),
            employee_uid.trim(),
            hashedPass.trim()
        ]);

        res.status(201).json({ insertedId: result.insertId });
    } catch (error) {
        // Handle duplicate UID error or other issues
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ message: "Employee UID already exists" });
        }
        console.error("Error inserting employee:", error);
        res.status(500).json({ message: "Internal Server Error" });
    }
});

// GET Endpoint for employees with Pagination and Search
app.get('/employees', async (req, res) => {
    try {
        // Extract query parameters with default values
        const page = parseInt(req.query.page) || 1; // Current page number
        const limit = parseInt(req.query.limit) || 10; // Number of records per page
        const search = req.query.search ? req.query.search.trim() : ''; // Search term

        // Calculate the offset for the SQL query
        const offset = (page - 1) * limit;

        // Base SQL query
        let baseQuery = 'FROM employees';
        let countQuery = 'SELECT COUNT(*) as total ' + baseQuery;
        let dataQuery = 'SELECT * ' + baseQuery;

        // Parameters array for prepared statements
        let params = [];
        let countParams = [];

        // Modify the queries to include WHERE clause if search is provided
        if (search) {
            baseQuery += ` WHERE employee_name LIKE ? 
                           OR employee_uid = ? 
                           OR employee_phone LIKE ? 
                           OR employee_email LIKE ?`;
            countQuery = 'SELECT COUNT(*) as total ' + baseQuery;
            dataQuery = 'SELECT * ' + baseQuery;

            // Add search term for employee_name, employee_uid, employee_phone, and employee_email
            params.push(`%${search}%`, search, `%${search}%`, `%${search}%`);
            countParams.push(`%${search}%`, search, `%${search}%`, `%${search}%`);
        }

        // Append ORDER BY, LIMIT, and OFFSET to the data query
        dataQuery += ' ORDER BY id DESC LIMIT ? OFFSET ?';
        params.push(limit, offset);

        // Execute the count query to get total records matching the search
        const [countResult] = await pool.query(countQuery, countParams);
        const total = countResult[0].total;
        const totalPages = Math.ceil(total / limit);

        // Execute the data query to get the actual records
        const [employees] = await pool.query(dataQuery, params);

        // Send the response with pagination and employee data
        res.status(200).json({
            total,
            page,
            limit,
            totalPages,
            employees
        });

    } catch (error) {
        console.error("Error fetching employees:", error);
        res.status(500).json({ message: "Failed to fetch employees" });
    }
});

// POST route to add on projects_master
app.post('/projects_master', async (req, res) => {
    const { project_name, project_code, project_status } = req.body;

    if (!project_name) {
        return res.status(400).json({ message: "project_name,project_code is required" });
    }

    try {
        const insertQuery = 'INSERT INTO projects_master (project_name,project_code,project_status) VALUES (?, ?, ?)';
        const [result] = await pool.query(insertQuery, [project_name.trim(),project_code, project_status || 1]);

        res.status(201).json({ insertedId: result.insertId });
    } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ message: "project_name already exists" });
        }
        console.error("Error inserting project_name:", error);
        res.status(500).json({ message: "Internal Server Error" });
    }
});


// GET Endpoint for Projects_Master with Pagination and Search
app.get('/projects_master', async (req, res) => {
    try {
        // Extract query parameters with default values
        const page = parseInt(req.query.page) || 1; // Current page number
        const limit = parseInt(req.query.limit) || 10; // Number of records per page
        const search = req.query.search ? req.query.search.trim() : ''; // Search term

        // Calculate the offset for the SQL query
        const offset = (page - 1) * limit;

        // Base SQL query
        let baseQuery = 'FROM projects_master';
        let countQuery = 'SELECT COUNT(*) as total ' + baseQuery;
        let dataQuery = 'SELECT * ' + baseQuery;

        // Parameters array for prepared statements
        let params = [];

        // If search is provided, modify the queries to include WHERE clause
        if (search) {
            baseQuery += ' WHERE project_name LIKE ? ';
            countQuery = 'SELECT COUNT(*) as total ' + baseQuery;
            dataQuery = 'SELECT * ' + baseQuery;
            params.push(`%${search}%`);
        }

        // Append ORDER BY, LIMIT, and OFFSET to the data query
        dataQuery += ' ORDER BY id DESC LIMIT ? OFFSET ?';
        params.push(limit, offset);

        // Execute the count query to get total records matching the search
        const [countResult] = await pool.query(countQuery, search ? [`%${search}%`] : []);
        const total = countResult[0].total;
        const totalPages = Math.ceil(total / limit);

        // Execute the data query to get the actual records
        const [projects_master] = await pool.query(dataQuery, params);

        res.status(200).json({
            total,
            page,
            limit,
            totalPages,
            projects_master
        });

    } catch (error) {
        console.error("Error fetching projects_master:", error);
        res.status(500).json({ message: "Failed to fetch projects_master" });
    }
});

// PATCH Endpoint to Update Projects_master
app.patch('/projects_master/:id', async (req, res) => {
    const { project_name, project_code, project_status } = req.body;
    const id = req.params.id;
    try {
        // Update the project in the `projects_master` table
        const [updateProjects_MasterResult] = await pool.query(
            'UPDATE projects_master SET project_name = ?, project_code = ?,project_status = ? WHERE id = ?',
            [project_name, project_code, project_status, id]
        );

        if (updateProjects_MasterResult.affectedRows === 0) {
            return res.status(404).json({ error: 'No changes made' });
        }

        // Respond to the client with the update result
        res.json(updateProjects_MasterResult);

    } catch (error) {
        console.error('Error updating Projects_Master:', error);
        res.status(500).json({ error: 'Failed to update Projects_Master.' });
    }
});

// POST route to add department
app.post('/departments', async (req, res) => {
    const { department_name, department_status } = req.body;

    if (!department_name) {
        return res.status(400).json({ message: "department_name is required" });
    }

    try {
        const insertQuery = 'INSERT INTO departments (department_name, department_status) VALUES (?, ?)';
        const [result] = await pool.query(insertQuery, [department_name.trim(), department_status || 1]);

        res.status(201).json({ insertedId: result.insertId });
    } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ message: "department_name already exists" });
        }
        console.error("Error inserting department_name:", error);
        res.status(500).json({ message: "Internal Server Error" });
    }
});

// GET Endpoint for Departments with Pagination and Search
app.get('/departments', async (req, res) => {
    try {
        // Extract query parameters with default values
        const page = parseInt(req.query.page) || 1; // Current page number
        const limit = parseInt(req.query.limit) || 10; // Number of records per page
        const search = req.query.search ? req.query.search.trim() : ''; // Search term

        // Calculate the offset for the SQL query
        const offset = (page - 1) * limit;

        // Base SQL query
        let baseQuery = 'FROM departments';
        let countQuery = 'SELECT COUNT(*) as total ' + baseQuery;
        let dataQuery = 'SELECT * ' + baseQuery;

        // Parameters array for prepared statements
        let params = [];

        // If search is provided, modify the queries to include WHERE clause
        if (search) {
            baseQuery += ' WHERE department_name LIKE ?';
            countQuery = 'SELECT COUNT(*) as total ' + baseQuery;
            dataQuery = 'SELECT * ' + baseQuery;
            params.push(`%${search}%`);
        }

        // Append ORDER BY, LIMIT, and OFFSET to the data query
        dataQuery += ' ORDER BY id DESC LIMIT ? OFFSET ?';
        params.push(limit, offset);

        // Execute the count query to get total records matching the search
        const [countResult] = await pool.query(countQuery, search ? [`%${search}%`] : []);
        const total = countResult[0].total;
        const totalPages = Math.ceil(total / limit);

        // Execute the data query to get the actual records
        const [departments] = await pool.query(dataQuery, params);

        res.status(200).json({
            total,
            page,
            limit,
            totalPages,
            departments
        });

    } catch (error) {
        console.error("Error fetching departments:", error);
        res.status(500).json({ message: "Failed to fetch departments" });
    }
});

// GET route to fetch all departments
app.get("/departments/all", async (req, res) => {
    try {
        // Query to fetch all departments from the departments table
        const query = 'SELECT * FROM departments';

        // Execute the query
        const [departments] = await pool.query(query);

        // Send the result as a response
        res.status(200).json(departments);
    } catch (error) {
        console.error("Error fetching departments:", error);
        res.status(500).json({ error: "Failed to fetch all departments" });
    }
});

// PATCH Endpoint to Update Department
app.patch('/departments/:id', async (req, res) => {
    const { department_name, department_status } = req.body;
    const id = req.params.id;
    try {
        // Update the department in the `departments` table
        const [updateDepartmentResult] = await pool.query(
            'UPDATE departments SET department_name = ?, department_status = ? WHERE id = ?',
            [department_name, department_status, id]
        );

        if (updateDepartmentResult.affectedRows === 0) {
            return res.status(404).json({ error: 'No changes made' });
        }

        // Respond to the client with the update result
        res.json(updateDepartmentResult);

    } catch (error) {
        console.error('Error updating department:', error);
        res.status(500).json({ error: 'Failed to update department.' });
    }
});

// POST route to add designation
app.post('/designations', async (req, res) => {
    const { designation, designation_status } = req.body;

    if (!designation) {
        return res.status(400).json({ message: "Designation is required" });
    }

    try {
        const insertQuery = 'INSERT INTO designations (designation, designation_status) VALUES (?, ?)';
        const [result] = await pool.query(insertQuery, [designation.trim(), designation_status || 1]);

        res.status(201).json({ insertedId: result.insertId });
    } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ message: "Designation already exists" });
        }
        console.error("Error inserting designation:", error);
        res.status(500).json({ message: "Internal Server Error" });
    }
});

// GET Endpoint for Designations with Pagination and Search
app.get('/designations', async (req, res) => {
    try {
        // Extract query parameters with default values
        const page = parseInt(req.query.page) || 1; // Current page number
        const limit = parseInt(req.query.limit) || 10; // Number of records per page
        const search = req.query.search ? req.query.search.trim() : ''; // Search term

        // Calculate the offset for the SQL query
        const offset = (page - 1) * limit;

        // Base SQL query
        let baseQuery = 'FROM designations';
        let countQuery = 'SELECT COUNT(*) as total ' + baseQuery;
        let dataQuery = 'SELECT * ' + baseQuery;

        // Parameters array for prepared statements
        let params = [];

        // If search is provided, modify the queries to include WHERE clause
        if (search) {
            baseQuery += ' WHERE designation LIKE ?';
            countQuery = 'SELECT COUNT(*) as total ' + baseQuery;
            dataQuery = 'SELECT * ' + baseQuery;
            params.push(`%${search}%`);
        }

        // Append ORDER BY, LIMIT, and OFFSET to the data query
        dataQuery += ' ORDER BY id DESC LIMIT ? OFFSET ?';
        params.push(limit, offset);

        // Execute the count query to get total records matching the search
        const [countResult] = await pool.query(countQuery, search ? [`%${search}%`] : []);
        const total = countResult[0].total;
        const totalPages = Math.ceil(total / limit);

        // Execute the data query to get the actual records
        const [designations] = await pool.query(dataQuery, params);

        res.status(200).json({
            total,
            page,
            limit,
            totalPages,
            designations
        });

    } catch (error) {
        console.error("Error fetching designations:", error);
        res.status(500).json({ message: "Failed to fetch designations" });
    }
});

// GET route to fetch all designations
app.get("/designations/all", async (req, res) => {
    try {
        // Query to fetch all designations from the designations table
        const query = 'SELECT * FROM designations';

        // Execute the query
        const [designations] = await pool.query(query);

        // Send the result as a response
        res.status(200).json(designations);
    } catch (error) {
        console.error("Error fetching designations:", error);
        res.status(500).json({ error: "Failed to fetch all designations" });
    }
});


// PATCH Endpoint to Update Designation
app.patch('/designations/:id', async (req, res) => {
    const { designation, designation_status } = req.body;
    const id = req.params.id;
    try {
        // Update the designation in the `designations` table
        const [updateDesignationResult] = await pool.query(
            'UPDATE designations SET designation = ?, designation_status = ? WHERE id = ?',
            [designation, designation_status, id]
        );

        if (updateDesignationResult.affectedRows === 0) {
            return res.status(404).json({ error: 'Designation not found or no changes made' });
        }

        // Respond to the client with the update result
        res.json(updateDesignationResult);

    } catch (error) {
        console.error('Error updating designation:', error);
        res.status(500).json({ error: 'Failed to update designation.' });
    }
});


// Start the server
app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});
