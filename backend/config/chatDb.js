const mysql = require('mysql2/promise');

// Create connection pool
const getConnection = async () => {
  const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT,

    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,

    ssl: {
      rejectUnauthorized: false
    }
  });

  return pool;
};

// Create chat tables
const initializeChatTables = async () => {
  try {
    const pool = await getConnection();

    // Chat sessions table
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS chat_sessions (
        id INT AUTO_INCREMENT PRIMARY KEY,
        session_id VARCHAR(255) UNIQUE NOT NULL,
        title VARCHAR(500) DEFAULT 'New Chat',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_session_id (session_id)
      )
    `);

    // Chat messages table
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS chat_messages (
        id INT AUTO_INCREMENT PRIMARY KEY,
        session_id VARCHAR(255) NOT NULL,
        role ENUM('user', 'assistant') NOT NULL,
        content LONGTEXT NOT NULL,
        language VARCHAR(10) DEFAULT 'en',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_session_id (session_id),
        INDEX idx_created_at (created_at)
      )
    `);

    // Chat PDF context table
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS chat_session_context (
        id INT AUTO_INCREMENT PRIMARY KEY,
        session_id VARCHAR(255) NOT NULL,
        file_id INT DEFAULT NULL,
        file_name VARCHAR(500) NOT NULL,
        extracted_text LONGTEXT,
        uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_session_id (session_id),
        INDEX idx_uploaded_at (uploaded_at)
      )
    `);

    await pool.end();

    console.log('✅ Chat tables initialized successfully');

  } catch (error) {
    console.error('❌ Failed to initialize chat tables:', error);
    throw error;
  }
};

module.exports = {
  getConnection,
  initializeChatTables
};