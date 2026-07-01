const express = require('express');
const router = express.Router();
const { initializeChatTables, getConnection } = require('../config/chatDb');

// Initialize tables on module load
initializeChatTables().catch(console.error);

// =============================================
// GENERATE SESSION TITLE from first message
// =============================================
const generateSessionTitle = (message) => {
  const words = message.trim().split(/\s+/).slice(0, 5).join(' ');
  const maxLength = Math.min(words.length, 40);
  return message.trim().substring(0, maxLength) + (message.length > 40 ? '...' : '') || 'New Chat';
};

// =============================================
// GET ALL SESSIONS (sorted by most recent)
// =============================================
router.get('/sessions', async (req, res) => {
  try {
    const pool = await getConnection();
    const [sessions] = await pool.execute(
      'SELECT session_id, title, created_at, updated_at FROM chat_sessions ORDER BY updated_at DESC'
    );
    await pool.end();
    
    res.json({
      success: true,
      sessions: sessions
    });
  } catch (error) {
    console.error('Get sessions error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to load chat history',
      error: error.message
    });
  }
});

// =============================================
// GET SINGLE SESSION with all messages
// =============================================
router.get('/sessions/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const pool = await getConnection();
    
    // Get session details
    const [sessions] = await pool.execute(
      'SELECT * FROM chat_sessions WHERE session_id = ?',
      [sessionId]
    );
    
    if (sessions.length === 0) {
      await pool.end();
      return res.status(404).json({
        success: false,
        message: 'Session not found'
      });
    }
    
    // Get all messages for this session
    const [messages] = await pool.execute(
      'SELECT id, role, content, language, created_at FROM chat_messages WHERE session_id = ? ORDER BY created_at ASC',
      [sessionId]
    );
    
    await pool.end();
    
    res.json({
      success: true,
      session: sessions[0],
      messages: messages
    });
  } catch (error) {
    console.error('Get session error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to load session',
      error: error.message
    });
  }
});

// =============================================
// CREATE NEW SESSION
// =============================================
router.post('/sessions', async (req, res) => {
  try {
    const { title } = req.body;
    const sessionId = 'session_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9);
    
    const pool = await getConnection();
    await pool.execute(
      'INSERT INTO chat_sessions (session_id, title) VALUES (?, ?)',
      [sessionId, title || 'New Chat']
    );
    await pool.end();
    
    res.json({
      success: true,
      sessionId: sessionId,
      title: title || 'New Chat'
    });
  } catch (error) {
    console.error('Create session error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create session',
      error: error.message
    });
  }
});

// =============================================
// SAVE MESSAGE
// =============================================
router.post('/sessions/:sessionId/messages', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { role, content, language } = req.body;
    
    if (!role || !content) {
      return res.status(400).json({
        success: false,
        message: 'Role and content are required'
      });
    }
    
    const pool = await getConnection();
    
    // Check if session exists
    const [sessions] = await pool.execute(
      'SELECT id FROM chat_sessions WHERE session_id = ?',
      [sessionId]
    );
    
    // If session doesn't exist, create it
    if (sessions.length === 0) {
      const title = generateSessionTitle(content);
      await pool.execute(
        'INSERT INTO chat_sessions (session_id, title) VALUES (?, ?)',
        [sessionId, title]
      );
    }
    
    // Insert message
    await pool.execute(
      'INSERT INTO chat_messages (session_id, role, content, language) VALUES (?, ?, ?, ?)',
      [sessionId, role, content, language || 'en']
    );
    
    await pool.end();
    
    res.json({
      success: true,
      message: 'Message saved'
    });
  } catch (error) {
    console.error('Save message error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to save message',
      error: error.message
    });
  }
});

// =============================================
// DELETE SESSION
// =============================================
router.delete('/sessions/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const pool = await getConnection();
    
    await pool.execute('DELETE FROM chat_messages WHERE session_id = ?', [sessionId]);
    await pool.execute('DELETE FROM chat_sessions WHERE session_id = ?', [sessionId]);
    await pool.end();
    
    res.json({
      success: true,
      message: 'Session deleted'
    });
  } catch (error) {
    console.error('Delete session error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete session',
      error: error.message
    });
  }
});

// =============================================
// CLEAR ALL SESSIONS
// =============================================
router.delete('/sessions', async (req, res) => {
  try {
    const pool = await getConnection();
    await pool.execute('DELETE FROM chat_messages');
    await pool.execute('DELETE FROM chat_sessions');
    await pool.end();
    
    res.json({
      success: true,
      message: 'All chat history cleared'
    });
  } catch (error) {
    console.error('Clear history error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to clear history',
      error: error.message
    });
  }
});

module.exports = router;