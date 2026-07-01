const mysql = require('mysql2/promise');

// Chat-specific database configuration (uses same DB)
const getConnection = async () => {
  const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
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
        INDEX idx_session_id (session_id),
        INDEX idx_updated_at (updated_at DESC)
      )
    `);
    
    // Chat messages table
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS chat_messages (
        id INT AUTO_INCREMENT PRIMARY KEY,
        session_id VARCHAR(255) NOT NULL,
        role ENUM('user', 'assistant') NOT NULL,
        content TEXT NOT NULL,
        language VARCHAR(10) DEFAULT 'en',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_session_id (session_id),
        INDEX idx_created_at (created_at),
        FOREIGN KEY (session_id) REFERENCES chat_sessions(session_id) ON DELETE CASCADE
      )
    `);
    
    // Chat session PDF context table
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS chat_session_context (
        id INT AUTO_INCREMENT PRIMARY KEY,
        session_id VARCHAR(255) NOT NULL,
        file_id INT DEFAULT NULL,
        file_name VARCHAR(500) NOT NULL,
        extracted_text TEXT,
        uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_session_id (session_id),
        INDEX idx_uploaded_at (uploaded_at DESC)
      )
    `);
    
    await pool.end();
    console.log('Chat tables and custom prompts initialized successfully');
  } catch (error) {
    console.error('Failed to initialize chat tables:', error);
    throw error;
  }
};

module.exports = {
  getConnection,
  initializeChatTables
};