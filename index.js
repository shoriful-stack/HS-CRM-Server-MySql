require("dotenv").config();

const express = require("express");
const cors = require("cors");
const mysql = require("mysql2/promise");
const multer = require('multer');
const path = require('path');
const XLSX = require('xlsx');
const bcrypt = require("bcryptjs");
const fs = require('fs');
const app = express();
const port = process.env.PORT || 3000;

// Middlewares
app.use(cors());
app.use(express.json()); // To parse JSON request bodies

// Create a MySQL connection pool for better performance and handling multiple requests
const pool = mysql.createPool({
  connectionLimit: 10, // Adjust based on your needs
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD, // Ensure you have DB_PASSWORD in your .env
  database: process.env.DB_NAME,
  port: process.env.DB_PORT || 3306, // Default MySQL port
  waitForConnections: true,
  queueLimit: 0,
});

// Set up Multer storage configuration (already provided by you)
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/'); // Directory for storing uploaded files
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + path.extname(file.originalname)); // Generate unique filename
  },
});

// Initialize multer
const upload = multer({ storage });
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)){
    fs.mkdirSync(uploadsDir);
}

// POST route to add an employee
app.post("/projects", async (req, res) => {
  const {
    project_name,
    customer_name,
    project_type,
    department_name,
    hod,
    pm,
    year,
    phase,
    project_code,
  } = req.body;

  // Check if all required fields are provided
  if (
    !project_name ||
    !customer_name ||
    !project_type ||
    !department_name ||
    !hod ||
    !pm ||
    !year ||
    !project_code
  ) {
    return res.status(400).json({ message: "All fields are required" });
  }

  try {
    // Fetch project ID from project master
    const [projectResult] = await pool.query(
      "SELECT id FROM projects_master WHERE project_name = ?",
      [project_name]
    );
    const project_id = projectResult[0]?.id;

    // Fetch customer ID
    const [customerResult] = await pool.query(
      "SELECT id FROM customers WHERE customer_name = ?",
      [customer_name]
    );
    const customer_id = customerResult[0]?.id;

    // Fetch department ID
    const [departmentResult] = await pool.query(
      "SELECT id FROM departments WHERE department_name = ?",
      [department_name]
    );
    const department_id = departmentResult[0]?.id;

    // Fetch HOD (Head of Department) ID
    const [hodResult] = await pool.query(
      "SELECT id FROM employees WHERE employee_name = ?",
      [hod]
    );
    const hod_id = hodResult[0]?.id;

    // Fetch Project Manager (PM) ID
    const [pmResult] = await pool.query(
      "SELECT id FROM employees WHERE employee_name = ?",
      [pm]
    );
    const pm_id = pmResult[0]?.id;

    // Insert project data
    const insertQuery = `
      INSERT INTO projects 
      (project_id, customer_id, project_type, department_id, hod_id, pm_id, year, phase, project_code) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const [result] = await pool.query(insertQuery, [
      project_id,
      customer_id,
      project_type,
      department_id,
      hod_id,
      pm_id,
      year,
      phase,
      project_code,
    ]);

    res.status(201).json({ insertedId: result.insertId });
  } catch (error) {
    if (error.code === "ER_DUP_ENTRY") {
      return res.status(409).json({ message: "Project code already exists" });
    }
    console.error("Error inserting project:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

app.get("/projects", async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;

    const {
      project_id,
      department_id,
      customer_id,
      pm_id,
      hod_id,
      project_type,
      project_name,
      customer_name,
      department,
      hod,
      pm,
      year,
      project_code,
    } = req.query;

    // Base query with alias for HOD and PM
    let baseQuery = `
SELECT p.*, pm.project_name, p.project_type, c.customer_name, d.department_name, 
       hod.employee_name AS hod_name, pm_employee.employee_name AS pm_name
FROM projects p
LEFT JOIN projects_master pm ON p.project_id = pm.id
LEFT JOIN customers c ON p.customer_id = c.id
LEFT JOIN departments d ON p.department_id = d.id
LEFT JOIN employees hod ON p.hod_id = hod.id
LEFT JOIN employees pm_employee ON p.pm_id = pm_employee.id
`;

    // Initialize the filtering conditions
    let whereConditions = [];
    let filterParams = [];

    // Create filters object
    const filters = {
      project_type,
      project_name,
      customer_name,
      department,
      pm,
      year,
      project_code,
      hod,
    };

    // Filtering logic
    if (filters.project_name) {
      whereConditions.push("pm.project_name = ?");
      filterParams.push(filters.project_name);
    }
    
    if (filters.project_type) {
      whereConditions.push("p.project_type = ?");
      filterParams.push(filters.project_type);
    }
    if (filters.customer_name) {
      whereConditions.push("c.customer_name = ?");
      filterParams.push(filters.customer_name);
    }
    if (filters.department) {
      whereConditions.push("d.department_name = ?");
      filterParams.push(filters.department);
    }
    if (filters.pm) {
      whereConditions.push("pm_employee.employee_name = ?");
      filterParams.push(filters.pm);
    }
    if (filters.year) {
      whereConditions.push("p.year = ?");
      filterParams.push(filters.year);
    }
    if (filters.project_code) {
      whereConditions.push("p.project_code = ?");
      filterParams.push(filters.project_code);
    }
    if (filters.hod) {
      whereConditions.push("hod.employee_name = ?");
      filterParams.push(filters.hod);
    }

    // Append where conditions if any
    if (whereConditions.length > 0) {
      baseQuery += " WHERE " + whereConditions.join(" AND ");
    }

    // Add pagination to the base query
    baseQuery += " ORDER BY p.id DESC LIMIT ? OFFSET ?";

    // Add limit and offset to the filterParams
    filterParams.push(limit, offset);

    // Fetch total count
    const countQuery = `SELECT COUNT(*) as total FROM projects p`; // Adjust your count query if needed
    const [countResult] = await pool.query(
      countQuery,
      filterParams.slice(0, filterParams.length - 2)
    );
    const total = countResult[0].total;
    const totalPages = Math.ceil(total / limit);

    // Fetch filtered projects
    const [projects] = await pool.query(baseQuery, filterParams);

    res.status(200).json({
      total,
      page,
      limit,
      totalPages,
      projects,
    });
  } catch (error) {
    console.error("Error fetching projects:", error);
    res.status(500).json({ message: "Failed to fetch projects" });
  }
});

// PATCH Endpoint to Update Project
app.patch("/projects/:id", async (req, res) => {
  const {
    project_name,
    customer_name,
    project_type,
    department_name,
    hod_name,
    pm_name,
    year,
    phase,
    project_code,
  } = req.body;
  const id = req.params.id;
  try {
    // Fetch project ID from project master
    const [projectResult] = await pool.query(
      "SELECT id FROM projects_master WHERE project_name = ?",
      [project_name]
    );
    const project_id = projectResult[0]?.id;

    // Fetch customer ID
    const [customerResult] = await pool.query(
      "SELECT id FROM customers WHERE customer_name = ?",
      [customer_name]
    );
    const customer_id = customerResult[0]?.id;

    // Fetch department ID
    const [departmentResult] = await pool.query(
      "SELECT id FROM departments WHERE department_name = ?",
      [department_name]
    );
    const department_id = departmentResult[0]?.id;

    // Fetch HOD (Head of Department) ID
    const [hodResult] = await pool.query(
      "SELECT id FROM employees WHERE employee_name = ?",
      [hod_name]
    );
    const hod_id = hodResult[0]?.id;

    // Fetch Project Manager (PM) ID
    const [pmResult] = await pool.query(
      "SELECT id FROM employees WHERE employee_name = ?",
      [pm_name]
    );
    const pm_id = pmResult[0]?.id;

    // Update the project in the `projects` table
    const [updateProjectResult] = await pool.query(
      "UPDATE projects SET project_id = ?, customer_id = ?, project_type = ?, department_id = ?, hod_id = ?, pm_id = ?, year = ?, phase = ?, project_code = ? WHERE id = ?",
      [
        project_id,
        customer_id,
        project_type,
        department_id,
        hod_id,
        pm_id,
        year,
        phase,
        project_code,
        id,
      ]
    );

    if (updateProjectResult.affectedRows === 0) {
      return res.status(404).json({ error: "No changes made" });
    }

    // Respond to the client with the update result
    res.json(updateProjectResult);
  } catch (error) {
    console.error("Error updating Project:", error);
    res.status(500).json({ error: "Failed to update Project." });
  }
});

// login endpoint
app.post("/login", async (req, res) => {
  const { email, password } = req.body;

  // Validate input
  if (!email || !password) {
    return res.status(400).json({ message: "Email and password are required" });
  }

  try {
    const [users] = await pool.query(
      "SELECT * FROM employees WHERE employee_email = ?",
      [email]
    );

    if (users.length === 0) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    const user = users[0];

    // Compare the hashed password
    const match = await bcrypt.compare(password, user.employee_pass);

    if (!match) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    // Send back the user role and employee name
    res.status(200).json({
      name: user.employee_name,
      role: user.role,
      email: user.employee_email,
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

// POST route to add an employee
app.post("/employees", async (req, res) => {
  const {
    employee_name,
    department_name,
    designation,
    employee_phone,
    employee_email,
    employee_uid,
    employee_pass,
  } = req.body;

  if (
    !employee_name ||
    !employee_phone ||
    !employee_email ||
    !employee_uid ||
    !employee_pass
  ) {
    return res.status(400).json({ message: "All fields are required" });
  }

  try {
    // Hash the employee_pass before saving to the database
    const hash = await bcrypt.genSalt(10);
    const hashedPass = await bcrypt.hash(employee_pass, hash);

    // Find department_id
    const [departmentResult] = await pool.query(
      "SELECT id FROM departments WHERE department_name = ?",
      [department_name]
    );
    const department_id = departmentResult[0]?.id;

    // Find designation_id
    const [designationResult] = await pool.query(
      "SELECT id FROM designations WHERE designation = ?",
      [designation]
    );
    const designation_id = designationResult[0]?.id;

    // Insert employee data with department_id and designation_id
    const insertQuery = `
      INSERT INTO employees 
      (employee_name, department_id, designation_id, employee_phone, employee_email, employee_uid, employee_pass) 
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `;

    const [result] = await pool.query(insertQuery, [
      employee_name,
      department_id,
      designation_id,
      employee_phone.trim(),
      employee_email.trim(),
      employee_uid.trim(),
      hashedPass.trim(),
    ]);

    res.status(201).json({ insertedId: result.insertId });
  } catch (error) {
    if (error.code === "ER_DUP_ENTRY") {
      return res.status(409).json({ message: "Employee UID already exists" });
    }
    console.error("Error inserting employee:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

// GET Endpoint for employees with Pagination and Search
app.get("/employees", async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const search = req.query.search ? req.query.search.trim() : "";
    const offset = (page - 1) * limit;

    let baseQuery = `
      SELECT e.*, d.department_name, des.designation 
      FROM employees e
      LEFT JOIN departments d ON e.department_id = d.id
      LEFT JOIN designations des ON e.designation_id = des.id
    `;

    let countQuery = "SELECT COUNT(*) as total FROM employees e";

    if (search) {
      baseQuery += ` WHERE e.employee_name LIKE ? OR e.employee_uid = ? OR e.employee_phone LIKE ? OR e.employee_email LIKE ?`;
      countQuery += ` WHERE e.employee_name LIKE ? OR e.employee_uid = ? OR e.employee_phone LIKE ? OR e.employee_email LIKE ?`;
    }

    const params = search
      ? [
          `%${search}%`,
          search,
          `%${search}%`,
          `%${search}%`,
          `%${search}%`,
          search,
          `%${search}%`,
          `%${search}%`,
        ]
      : [];

    baseQuery += " ORDER BY e.id DESC LIMIT ? OFFSET ?";
    params.push(limit, offset);

    const [countResult] = await pool.query(countQuery, params.slice(0, 4));
    const total = countResult[0].total;
    const totalPages = Math.ceil(total / limit);

    const [employees] = await pool.query(baseQuery, params);

    res.status(200).json({
      total,
      page,
      limit,
      totalPages,
      employees,
    });
  } catch (error) {
    console.error("Error fetching employees:", error);
    res.status(500).json({ message: "Failed to fetch employees" });
  }
});

// GET route to fetch all employees
app.get("/employees/all", async (req, res) => {
  try {
    // Query to fetch all employees from the employees table
    const query = "SELECT * FROM employees";

    // Execute the query
    const [employees] = await pool.query(query);

    // Send the result as a response
    res.status(200).json(employees);
  } catch (error) {
    console.error("Error fetching employees:", error);
    res.status(500).json({ error: "Failed to fetch all employees" });
  }
});

// fetch employee details by email
app.get("/employee/:email", async (req, res) => {
  const { email } = req.params;

  try {
    const [employee] = await pool.query(
      `
      SELECT e.*, d.department_name, des.designation
      FROM employees e
      LEFT JOIN departments d ON e.department_id = d.id
      LEFT JOIN designations des ON e.designation_id = des.id
      WHERE e.employee_email = ?
      `,
      [email]
    );

    if (employee.length === 0) {
      return res.status(404).json({ message: "Employee not found" });
    }

    res.status(200).json(employee[0]);
  } catch (error) {
    console.error("Error fetching employee details:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

app.put("/employee/:email/password", async (req, res) => {
  const { email } = req.params;
  const { newPassword } = req.body;

  try {
    const hash = await bcrypt.genSalt(10);
    const hashedPass = await bcrypt.hash(newPassword, hash);

    const [result] = await pool.query(
      "UPDATE employees SET employee_pass = ? WHERE employee_email = ?",
      [hashedPass, email]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "Employee not found" });
    }

    res.status(200).json({ message: "Password updated successfully" });
  } catch (error) {
    console.error("Error updating password:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

// PATCH Endpoint to Update Employee
app.patch("/employees/:id", async (req, res) => {
  const {
    employee_name,
    department_name,
    designation,
    employee_phone,
    employee_email,
    employee_uid,
  } = req.body;
  const id = req.params.id;
  try {
    // Find department_id
    const [departmentResult] = await pool.query(
      "SELECT id FROM departments WHERE department_name = ?",
      [department_name]
    );
    const department_id = departmentResult[0]?.id;

    // Find designation_id
    const [designationResult] = await pool.query(
      "SELECT id FROM designations WHERE designation = ?",
      [designation]
    );
    const designation_id = designationResult[0]?.id;

    // Update the project in the `employees` table
    const [updateEmployeeResult] = await pool.query(
      "UPDATE employees SET employee_name = ?, department_id = ?,designation_id = ?, employee_phone = ?, employee_email = ?, employee_uid = ? WHERE id = ?",
      [
        employee_name,
        department_id,
        designation_id,
        employee_phone.trim(),
        employee_email.trim(),
        employee_uid.trim(),
        id,
      ]
    );

    if (updateEmployeeResult.affectedRows === 0) {
      return res.status(404).json({ error: "No changes made" });
    }

    // Respond to the client with the update result
    res.json(updateEmployeeResult);
  } catch (error) {
    console.error("Error updating Employees:", error);
    res.status(500).json({ error: "Failed to update Employees." });
  }
});

// POST route to add an customer
app.post("/customers", async (req, res) => {
  const {
    customer_name,
    customer_phone,
    customer_email,
    customer_address,
    customer_status,
  } = req.body;

  // Validation: Ensure all required fields are provided
  if (!customer_name) {
    return res
      .status(400)
      .json({ message: "Customer Name Fields are required" });
  }

  try {
    const insertQuery = `
            INSERT INTO customers 
            (customer_name, customer_phone, customer_email, customer_address, customer_status) 
            VALUES (?, ?, ?, ?, ?)
        `;

    const [result] = await pool.query(insertQuery, [
      customer_name,
      customer_phone.trim(),
      customer_email.trim(),
      customer_address,
      customer_status,
    ]);

    res.status(201).json({ insertedId: result.insertId });
  } catch (error) {
    // Handle duplicate UID error or other issues
    if (error.code === "ER_DUP_ENTRY") {
      return res.status(409).json({ message: "this customer already exists" });
    }
    console.error("Error inserting customer:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

// GET Endpoint for customers with Pagination and Search
app.get("/customers", async (req, res) => {
  try {
    // Extract query parameters with default values
    const page = parseInt(req.query.page) || 1; // Current page number
    const limit = parseInt(req.query.limit) || 10; // Number of records per page
    const search = req.query.search ? req.query.search.trim() : ""; // Search term

    // Calculate the offset for the SQL query
    const offset = (page - 1) * limit;

    // Base SQL query
    let baseQuery = "FROM customers";
    let countQuery = "SELECT COUNT(*) as total " + baseQuery;
    let dataQuery = "SELECT * " + baseQuery;

    // Parameters array for prepared statements
    let params = [];
    let countParams = [];

    // Modify the queries to include WHERE clause if search is provided
    if (search) {
      baseQuery += ` WHERE customer_name LIKE ?
                           OR customer_phone LIKE ?
                           OR customer_email LIKE ?  
                           OR customer_address LIKE ?`;
      countQuery = "SELECT COUNT(*) as total " + baseQuery;
      dataQuery = "SELECT * " + baseQuery;

      // Add search term for customer_name, customer_address, customer_phone, and customer_email
      params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
      countParams.push(
        `%${search}%`,
        `%${search}%`,
        `%${search}%`,
        `%${search}%`
      );
    }

    // Append ORDER BY, LIMIT, and OFFSET to the data query
    dataQuery += " ORDER BY id DESC LIMIT ? OFFSET ?";
    params.push(limit, offset);

    // Execute the count query to get total records matching the search
    const [countResult] = await pool.query(countQuery, countParams);
    const total = countResult[0].total;
    const totalPages = Math.ceil(total / limit);

    // Execute the data query to get the actual records
    const [customers] = await pool.query(dataQuery, params);

    // Send the response with pagination and customer data
    res.status(200).json({
      total,
      page,
      limit,
      totalPages,
      customers,
    });
  } catch (error) {
    console.error("Error fetching customers:", error);
    res.status(500).json({ message: "Failed to fetch customers" });
  }
});

// GET route to fetch all customers
app.get("/customers/all", async (req, res) => {
  try {
    // Query to fetch all customers from the customers table
    const query = "SELECT * FROM customers";

    // Execute the query
    const [customers] = await pool.query(query);

    // Send the result as a response
    res.status(200).json(customers);
  } catch (error) {
    console.error("Error fetching customers:", error);
    res.status(500).json({ error: "Failed to fetch all customers" });
  }
});

// PATCH Endpoint to Update customer
app.patch("/customers/:id", async (req, res) => {
  const {
    customer_name,
    customer_phone,
    customer_email,
    customer_address,
    customer_status,
  } = req.body;
  const id = req.params.id;
  try {
    // Update the customer in the `customers` table
    const [updateCustomerResult] = await pool.query(
      "UPDATE customers SET customer_name = ?,customer_phone = ?, customer_email = ?, customer_address = ?, customer_status = ? WHERE id = ?",
      [
        customer_name,
        customer_phone,
        customer_email,
        customer_address,
        customer_status,
        id,
      ]
    );

    if (updateCustomerResult.affectedRows === 0) {
      return res.status(404).json({ error: "No changes made" });
    }

    // Respond to the client with the update result
    res.json(updateCustomerResult);
  } catch (error) {
    console.error("Error updating Customer:", error);
    res.status(500).json({ error: "Failed to update department." });
  }
});

// POST route to add on projects_master
app.post("/projects_master", async (req, res) => {
  const { project_name, project_code, project_status } = req.body;

  if (!project_name) {
    return res
      .status(400)
      .json({ message: "project_name,project_code is required" });
  }

  try {
    const insertQuery =
      "INSERT INTO projects_master (project_name,project_code,project_status) VALUES (?, ?, ?)";
    const [result] = await pool.query(insertQuery, [
      project_name.trim(),
      project_code,
      project_status || 1,
    ]);

    res.status(201).json({ insertedId: result.insertId });
  } catch (error) {
    if (error.code === "ER_DUP_ENTRY") {
      return res.status(409).json({ message: "project_name already exists" });
    }
    console.error("Error inserting project_name:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

// POST route to import on projects_master
app.post('/projects_master/import', upload.single('file'), async (req, res) => {
  if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded!' });
  }

  try {
      const workbook = XLSX.readFile(req.file.path);
      const sheetName = workbook.SheetNames[0];
      const sheetData = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]);

      const projectData = sheetData.map((row) => ({
          project_name: row['Project Name'], 
          project_code: row['Project Code'], 
          project_status: row['Project Status'] === 'Active' ? 1 : 0,
      }));

      if (projectData.length === 0) {
          return res.status(400).json({ message: 'No valid data found in the file!' });
      }

      const insertQuery = `INSERT INTO projects_master (project_name, project_code, project_status) VALUES ?`;
      const values = projectData.map((project) => [
          project.project_name,
          project.project_code,
          project.project_status,
      ]);

      // Using the connection pool to execute the query
      await pool.query(insertQuery, [values]);

      fs.unlinkSync(req.file.path); // Clean up the uploaded file
      res.status(200).json({ message: 'Projects imported successfully!' });
  } catch (error) {
      console.error('Error importing projects:', error);
      res.status(500).json({ message: 'Failed to import projects.' });
  }
});

// GET Endpoint for Projects_Master with Pagination and Search
app.get("/projects_master", async (req, res) => {
  try {
    // Extract query parameters with default values
    const page = parseInt(req.query.page) || 1; // Current page number
    const limit = parseInt(req.query.limit) || 10; // Number of records per page
    const search = req.query.search ? req.query.search.trim() : ""; // Search term

    // Calculate the offset for the SQL query
    const offset = (page - 1) * limit;

    // Base SQL query
    let baseQuery = "FROM projects_master";
    let countQuery = "SELECT COUNT(*) as total " + baseQuery;
    let dataQuery = "SELECT * " + baseQuery;

    // Parameters array for prepared statements
    let params = [];

    // If search is provided, modify the queries to include WHERE clause
    // If search is provided, modify the queries to include WHERE clause
    if (search) {
      baseQuery += ` WHERE project_name LIKE ? OR project_code LIKE ?`;
      countQuery = "SELECT COUNT(*) as total " + baseQuery;
      dataQuery = "SELECT * " + baseQuery;

      // Push both parameters for the search
      params.push(`%${search}%`, `%${search}%`);
    }

    // Append ORDER BY, LIMIT, and OFFSET to the data query
    dataQuery += " ORDER BY id DESC LIMIT ? OFFSET ?";
    params.push(limit, offset);

    // Execute the count query to get total records matching the search
    const [countResult] = await pool.query(
      countQuery,
      search ? [`%${search}%`, `%${search}%`] : [] // Pass both parameters
    );

    const total = countResult[0].total;
    const totalPages = Math.ceil(total / limit);

    // Execute the data query to get the actual records
    const [projects_master] = await pool.query(dataQuery, params);

    res.status(200).json({
      total,
      page,
      limit,
      totalPages,
      projects_master,
    });
  } catch (error) {
    console.error("Error fetching projects_master:", error);
    res.status(500).json({ message: "Failed to fetch projects_master" });
  }
});

// GET route to fetch all projects_master
app.get("/projects_master/all", async (req, res) => {
  try {
    // Query to fetch all projects from the projects_master table
    const query = "SELECT * FROM projects_master";

    // Execute the query
    const [projects_master] = await pool.query(query);

    // Send the result as a response
    res.status(200).json(projects_master);
  } catch (error) {
    console.error("Error fetching projects_master:", error);
    res.status(500).json({ error: "Failed to fetch all projects_master" });
  }
});

// PATCH Endpoint to Update Projects_master
app.patch("/projects_master/:id", async (req, res) => {
  const { project_name, project_code, project_status } = req.body;
  const id = req.params.id;
  try {
    // Update the project in the `projects_master` table
    const [updateProjects_MasterResult] = await pool.query(
      "UPDATE projects_master SET project_name = ?, project_code = ?,project_status = ? WHERE id = ?",
      [project_name, project_code, project_status, id]
    );

    if (updateProjects_MasterResult.affectedRows === 0) {
      return res.status(404).json({ error: "No changes made" });
    }

    // Respond to the client with the update result
    res.json(updateProjects_MasterResult);
  } catch (error) {
    console.error("Error updating Projects_Master:", error);
    res.status(500).json({ error: "Failed to update Projects_Master." });
  }
});

// POST route to add department
app.post("/departments", async (req, res) => {
  const { department_name, department_status } = req.body;

  if (!department_name) {
    return res.status(400).json({ message: "department_name is required" });
  }

  try {
    const insertQuery =
      "INSERT INTO departments (department_name, department_status) VALUES (?, ?)";
    const [result] = await pool.query(insertQuery, [
      department_name.trim(),
      department_status || 1,
    ]);

    res.status(201).json({ insertedId: result.insertId });
  } catch (error) {
    if (error.code === "ER_DUP_ENTRY") {
      return res
        .status(409)
        .json({ message: "department_name already exists" });
    }
    console.error("Error inserting department_name:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

// GET Endpoint for Departments with Pagination and Search
app.get("/departments", async (req, res) => {
  try {
    // Extract query parameters with default values
    const page = parseInt(req.query.page) || 1; // Current page number
    const limit = parseInt(req.query.limit) || 10; // Number of records per page
    const search = req.query.search ? req.query.search.trim() : ""; // Search term

    // Calculate the offset for the SQL query
    const offset = (page - 1) * limit;

    // Base SQL query
    let baseQuery = "FROM departments";
    let countQuery = "SELECT COUNT(*) as total " + baseQuery;
    let dataQuery = "SELECT * " + baseQuery;

    // Parameters array for prepared statements
    let params = [];

    // If search is provided, modify the queries to include WHERE clause
    if (search) {
      baseQuery += " WHERE department_name LIKE ?";
      countQuery = "SELECT COUNT(*) as total " + baseQuery;
      dataQuery = "SELECT * " + baseQuery;
      params.push(`%${search}%`);
    }

    // Append ORDER BY, LIMIT, and OFFSET to the data query
    dataQuery += " ORDER BY id DESC LIMIT ? OFFSET ?";
    params.push(limit, offset);

    // Execute the count query to get total records matching the search
    const [countResult] = await pool.query(
      countQuery,
      search ? [`%${search}%`] : []
    );
    const total = countResult[0].total;
    const totalPages = Math.ceil(total / limit);

    // Execute the data query to get the actual records
    const [departments] = await pool.query(dataQuery, params);

    res.status(200).json({
      total,
      page,
      limit,
      totalPages,
      departments,
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
    const query = "SELECT * FROM departments";

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
app.patch("/departments/:id", async (req, res) => {
  const { department_name, department_status } = req.body;
  const id = req.params.id;
  try {
    // Update the department in the `departments` table
    const [updateDepartmentResult] = await pool.query(
      "UPDATE departments SET department_name = ?, department_status = ? WHERE id = ?",
      [department_name, department_status, id]
    );

    if (updateDepartmentResult.affectedRows === 0) {
      return res.status(404).json({ error: "No changes made" });
    }

    // Respond to the client with the update result
    res.json(updateDepartmentResult);
  } catch (error) {
    console.error("Error updating department:", error);
    res.status(500).json({ error: "Failed to update department." });
  }
});

// POST route to add designation
app.post("/designations", async (req, res) => {
  const { designation, designation_status } = req.body;

  if (!designation) {
    return res.status(400).json({ message: "Designation is required" });
  }

  try {
    const insertQuery =
      "INSERT INTO designations (designation, designation_status) VALUES (?, ?)";
    const [result] = await pool.query(insertQuery, [
      designation.trim(),
      designation_status || 1,
    ]);

    res.status(201).json({ insertedId: result.insertId });
  } catch (error) {
    if (error.code === "ER_DUP_ENTRY") {
      return res.status(409).json({ message: "Designation already exists" });
    }
    console.error("Error inserting designation:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

// GET Endpoint for Designations with Pagination and Search
app.get("/designations", async (req, res) => {
  try {
    // Extract query parameters with default values
    const page = parseInt(req.query.page) || 1; // Current page number
    const limit = parseInt(req.query.limit) || 10; // Number of records per page
    const search = req.query.search ? req.query.search.trim() : ""; // Search term

    // Calculate the offset for the SQL query
    const offset = (page - 1) * limit;

    // Base SQL query
    let baseQuery = "FROM designations";
    let countQuery = "SELECT COUNT(*) as total " + baseQuery;
    let dataQuery = "SELECT * " + baseQuery;

    // Parameters array for prepared statements
    let params = [];

    // If search is provided, modify the queries to include WHERE clause
    if (search) {
      baseQuery += " WHERE designation LIKE ?";
      countQuery = "SELECT COUNT(*) as total " + baseQuery;
      dataQuery = "SELECT * " + baseQuery;
      params.push(`%${search}%`);
    }

    // Append ORDER BY, LIMIT, and OFFSET to the data query
    dataQuery += " ORDER BY id DESC LIMIT ? OFFSET ?";
    params.push(limit, offset);

    // Execute the count query to get total records matching the search
    const [countResult] = await pool.query(
      countQuery,
      search ? [`%${search}%`] : []
    );
    const total = countResult[0].total;
    const totalPages = Math.ceil(total / limit);

    // Execute the data query to get the actual records
    const [designations] = await pool.query(dataQuery, params);

    res.status(200).json({
      total,
      page,
      limit,
      totalPages,
      designations,
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
    const query = "SELECT * FROM designations";

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
app.patch("/designations/:id", async (req, res) => {
  const { designation, designation_status } = req.body;
  const id = req.params.id;
  try {
    // Update the designation in the `designations` table
    const [updateDesignationResult] = await pool.query(
      "UPDATE designations SET designation = ?, designation_status = ? WHERE id = ?",
      [designation, designation_status, id]
    );

    if (updateDesignationResult.affectedRows === 0) {
      return res
        .status(404)
        .json({ error: "Designation not found or no changes made" });
    }

    // Respond to the client with the update result
    res.json(updateDesignationResult);
  } catch (error) {
    console.error("Error updating designation:", error);
    res.status(500).json({ error: "Failed to update designation." });
  }
});

// Start the server
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
