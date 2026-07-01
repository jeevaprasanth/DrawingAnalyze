const mysql = require('mysql2/promise');
require('dotenv').config();

const DB_NAME = process.env.DB_NAME || 'defaultdb';

// SSL config for Aiven
const sslConfig = {
  rejectUnauthorized: false
};

// Initial connection (without database)
const initPool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
  waitForConnections: true,
  connectionLimit: 2,
  queueLimit: 0,
  ssl: sslConfig
});

// Main database pool
const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME || DB_NAME,
  port: process.env.DB_PORT,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  ssl: sslConfig
});

async function initializeDatabase() {
  try {
    console.log('Connecting to database...');

    const initConn = await initPool.getConnection();

    await initConn.execute(`
      CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\`
      CHARACTER SET utf8mb4
      COLLATE utf8mb4_unicode_ci
    `);

    initConn.release();

    console.log(`Database '${DB_NAME}' verified`);

    const connection = await pool.getConnection();

    console.log('Database connection successful');

    // ---------- pdf_files ----------
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS pdf_files (
        id INT AUTO_INCREMENT PRIMARY KEY,
        file_name VARCHAR(255) NOT NULL,
        stored_file_name VARCHAR(255) NOT NULL,
        file_path VARCHAR(500) NOT NULL,
        file_size BIGINT DEFAULT 0,
        upload_status ENUM('uploaded','analyzing','completed','failed')
        DEFAULT 'uploaded',
        uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // ---------- components ----------
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS components (
        id INT AUTO_INCREMENT PRIMARY KEY,
        pdf_id INT NOT NULL,
        component_name VARCHAR(100) NOT NULL,
        page_number INT DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (pdf_id) REFERENCES pdf_files(id)
        ON DELETE CASCADE
      )
    `);

    // ---------- elements ----------
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS elements (
        id INT AUTO_INCREMENT PRIMARY KEY,
        component_id INT NOT NULL,
        element_raw VARCHAR(100) NOT NULL,
        first_element VARCHAR(50) NOT NULL,
        value1 VARCHAR(50) DEFAULT NULL,
        value2 VARCHAR(50) DEFAULT NULL,
        value3 VARCHAR(50) DEFAULT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (component_id) REFERENCES components(id)
        ON DELETE CASCADE
      )
    `);

    // ---------- bom_data ----------
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS bom_data (
        id INT AUTO_INCREMENT PRIMARY KEY,
        pdf_id INT NOT NULL,
        element VARCHAR(100) DEFAULT NULL,
        description TEXT,
        item_code VARCHAR(200) DEFAULT NULL,
        page_number INT DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (pdf_id) REFERENCES pdf_files(id)
        ON DELETE CASCADE
      )
    `);

    // ---------- analysis_results ----------
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS analysis_results (
        id INT AUTO_INCREMENT PRIMARY KEY,
        pdf_id INT NOT NULL,
        component VARCHAR(100) NOT NULL,
        element VARCHAR(50) DEFAULT NULL,
        item_code VARCHAR(200) DEFAULT NULL,
        description TEXT,
        match_status ENUM('matched','partial_match','no_match')
        DEFAULT 'no_match',
        confidence_score INT DEFAULT 0,
        remarks TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        related_elements VARCHAR(200) DEFAULT NULL,
        first_element_value VARCHAR(50) DEFAULT NULL,
        extracted_number INT DEFAULT NULL,
        second_element_value VARCHAR(50) DEFAULT NULL,
        second_extracted_number INT DEFAULT NULL,
        second_item_code VARCHAR(200) DEFAULT NULL,
        third_element_value VARCHAR(50) DEFAULT NULL,
        third_extracted_number INT DEFAULT NULL,
        third_item_code VARCHAR(200) DEFAULT NULL,
        page_number INT DEFAULT 1,
        bbox_x FLOAT DEFAULT NULL,
        bbox_y FLOAT DEFAULT NULL,
        bbox_width FLOAT DEFAULT NULL,
        bbox_height FLOAT DEFAULT NULL,
        FOREIGN KEY (pdf_id) REFERENCES pdf_files(id)
        ON DELETE CASCADE
      )
    `);

    connection.release();

    await initPool.end();

    console.log('✅ Database tables initialized successfully');

  } catch (error) {
    console.error('❌ Database Error:', error);
    throw error;
  }
}

module.exports = {
  pool,
  initializeDatabase
};