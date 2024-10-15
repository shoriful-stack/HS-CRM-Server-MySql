require('dotenv').config(); 

const express = require('express');
const app = express();
const cors = require('cors');
const mysql = require('mysql');
const port = 3000;

// Middlewares
app.use(cors());
app.use(express.json());
// Serve static files from the 'uploads' directory
// app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Create a MySQL connection using mysql2
const conn = mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: "",
    database: process.env.DB_NAME,
    port: process.env.DB_PORT
});

// Connect to MySQL
conn.connect((error) => {
    if (error) {
        console.error("Error connecting to the database:", error);
    } else {
        console.log("Connected to the MySQL database!");
    }
});


// Start the server
app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});
