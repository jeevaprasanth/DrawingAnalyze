const mysql = require('mysql2/promise');
require('dotenv').config();

const DB_NAME = process.env.DB_NAME || 'engineering_drawing_db';

// Create initial connection without specifying database
const initPool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || 'jeeva@1824S',
  port: process.env.DB_PORT || 3306,
  waitForConnections: true,
  connectionLimit: 2,
  queueLimit: 0
});

// Create MySQL connection pool for the actual database
const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || 'jeeva@1824S',
  database: DB_NAME,
  port: process.env.DB_PORT || 3306,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

/**
 * Initialize database tables
 * Creates database and all required tables if they don't exist
 */
async function initializeDatabase() {
  try {
    // First, create the database if it doesn't exist
    const initConn = await initPool.getConnection();
    await initConn.execute(`CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    initConn.release();
    console.log(`Database '${DB_NAME}' ensured to exist`);

    // Now connect to the actual database and create tables
    const connection = await pool.getConnection();
    
    // Create pdf_files table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS pdf_files (
        id INT AUTO_INCREMENT PRIMARY KEY,
        file_name VARCHAR(255) NOT NULL,
        stored_file_name VARCHAR(255) NOT NULL,
        file_path VARCHAR(500) NOT NULL,
        file_size BIGINT DEFAULT 0,
        upload_status ENUM('uploaded', 'analyzing', 'completed', 'failed') DEFAULT 'uploaded',
        uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create components table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS components (
        id INT AUTO_INCREMENT PRIMARY KEY,
        pdf_id INT NOT NULL,
        component_name VARCHAR(100) NOT NULL,
        page_number INT DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (pdf_id) REFERENCES pdf_files(id) ON DELETE CASCADE
      )
    `);

    // Create elements table
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
        FOREIGN KEY (component_id) REFERENCES components(id) ON DELETE CASCADE
      )
    `);

    // Create bom_data table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS bom_data (
        id INT AUTO_INCREMENT PRIMARY KEY,
        pdf_id INT NOT NULL,
        element VARCHAR(100) DEFAULT NULL,
        description TEXT,
        item_code VARCHAR(200) DEFAULT NULL,
        page_number INT DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (pdf_id) REFERENCES pdf_files(id) ON DELETE CASCADE
      )
    `);

    // Create analysis_results table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS analysis_results (
        id INT AUTO_INCREMENT PRIMARY KEY,
        pdf_id INT NOT NULL,
        component VARCHAR(100) NOT NULL,
        element VARCHAR(50) DEFAULT NULL,
        item_code VARCHAR(200) DEFAULT NULL,
        description TEXT,
        match_status ENUM('matched', 'partial_match', 'no_match') DEFAULT 'no_match',
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
        FOREIGN KEY (pdf_id) REFERENCES pdf_files(id) ON DELETE CASCADE
      )
    `);

    // Migration: Add missing columns to analysis_results if upgrading from old schema
    // MySQL does NOT support ADD COLUMN IF NOT EXISTS, so try individually
    const columnsToAdd = [
      { name: 'related_elements', type: 'VARCHAR(200) DEFAULT NULL' },
      { name: 'first_element_value', type: 'VARCHAR(50) DEFAULT NULL' },
      { name: 'extracted_number', type: 'INT DEFAULT NULL' },
      { name: 'second_element_value', type: 'VARCHAR(50) DEFAULT NULL' },
      { name: 'second_extracted_number', type: 'INT DEFAULT NULL' },
      { name: 'second_item_code', type: 'VARCHAR(200) DEFAULT NULL' },
      { name: 'third_element_value', type: 'VARCHAR(50) DEFAULT NULL' },
      { name: 'third_extracted_number', type: 'INT DEFAULT NULL' },
      { name: 'third_item_code', type: 'VARCHAR(200) DEFAULT NULL' },
      { name: 'page_number', type: 'INT DEFAULT 1' },
      { name: 'bbox_x', type: 'FLOAT DEFAULT NULL' },
      { name: 'bbox_y', type: 'FLOAT DEFAULT NULL' },
      { name: 'bbox_width', type: 'FLOAT DEFAULT NULL' },
      { name: 'bbox_height', type: 'FLOAT DEFAULT NULL' }
    ];
    for (const col of columnsToAdd) {
      try {
        await connection.execute(`ALTER TABLE analysis_results ADD COLUMN \`${col.name}\` ${col.type}`);
      } catch (colError) {
        // Error 1060 = Duplicate column name - ignore, column already exists
        if (colError.errno !== 1060) {
          console.warn(`Migration note for ${col.name}:`, colError.message);
        }
      }
    }

    connection.release();
    // Close the init pool since it's no longer needed
    await initPool.end();
    console.log('Database tables initialized successfully');
  } catch (error) {
    console.error('Error initializing database:', error.message);
    throw error;
  }
}

module.exports = { pool, initializeDatabase };