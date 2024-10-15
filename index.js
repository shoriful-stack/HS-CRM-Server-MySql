require('dotenv').config(); 

const express = require('express');
const cors = require('cors');
const mysql = require('mysql2/promise'); // Use mysql2 with promise support
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

// PATCH Endpoint to Update Designation
app.patch('/designations/:id', async (req, res) => {
    const { designation, designation_status } = req.body;
    const id = req.params.id;

    if (isNaN(id)) {
        return res.status(400).json({ error: 'Invalid designation ID' });
    }

    let connection;

    try {
        // Get a connection from the pool
        connection = await pool.getConnection();

        // Start a transaction
        await connection.beginTransaction();

        // 1. Find the existing designation
        const [existingDesignationResult] = await connection.query(
            'SELECT designation FROM designations WHERE id = ?',
            [id]
        );

        if (existingDesignationResult.length === 0) {
            await connection.rollback();
            return res.status(404).json({ error: 'Designation not found' });
        }

        const oldDesignation = existingDesignationResult[0].designation;

        // 2. Update the designation in the `designations` table
        const [updateDesignationResult] = await connection.query(
            'UPDATE designations SET designation = ?, designation_status = ? WHERE id = ?',
            [designation, designation_status, id]
        );

        if (updateDesignationResult.affectedRows === 0) {
            await connection.rollback();
            return res.status(500).json({ error: 'Failed to update designation' });
        }

        // 3. If the designation name has changed, update the `employees` table
        if (oldDesignation !== designation) {
            const [updateEmployeeResult] = await connection.query(
                'UPDATE employees SET designation = ? WHERE designation = ?',
                [designation, oldDesignation]
            );

            console.log(`Updated ${updateEmployeeResult.affectedRows} employees with new designation.`);
        }

        // Commit the transaction if everything is successful
        await connection.commit();

        res.send(updateDesignationResult);

    } catch (error) {
        console.error('Error updating designation and employees:', error);
        if (connection) {
            try {
                await connection.rollback(); // Rollback transaction in case of error
            } catch (rollbackError) {
                console.error('Error during transaction rollback:', rollbackError);
            }
        }
        res.status(500).json({ error: 'Failed to update designation and related employees.' });
    } finally {
        if (connection) connection.release(); // Release the connection back to the pool
    }
});

// Start the server
app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});
