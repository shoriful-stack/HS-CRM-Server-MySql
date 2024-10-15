require('dotenv').config(); 

const express = require('express');
const cors = require('cors');
const mysql = require('mysql');
const app = express();
const port = 3000;

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
    port: process.env.DB_PORT
});

// Function to perform queries using Promises for easier async/await usage
const query = (sql, values) => {
    return new Promise((resolve, reject) => {
        pool.query(sql, values, (error, results) => {
            if (error) reject(error);
            else resolve(results);
        });
    });
};

// POST route to add designation
app.post('/designations', async (req, res) => {
    const { designation, designation_status } = req.body;

    if (!designation) {
        return res.status(400).json({ message: "Designation is required" });
    }

    try {
        const insertQuery = 'INSERT INTO designations (designation, designation_status) VALUES (?, ?)';
        const result = await query(insertQuery, [designation.trim(), designation_status || 1]);

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
        const countResult = await query(countQuery, search ? [`%${search}%`] : []);
        const total = countResult[0].total;
        const totalPages = Math.ceil(total / limit);

        // Execute the data query to get the actual records
        const designations = await query(dataQuery, params);

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

// Start the server
app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});
