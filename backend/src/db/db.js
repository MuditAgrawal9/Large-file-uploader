const mysql = require("mysql2/promise");

const pool = mysql.createPool({
  host: "localhost",
  user: "root",
  password: "", // put password if you have one
  database: "large_uploader",
  waitForConnections: true,
  connectionLimit: 10,
});

module.exports = pool;
