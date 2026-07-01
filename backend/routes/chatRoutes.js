const express = require('express');
const router = express.Router();
const https = require('https');
const multer = require('multer');
const pdfParse = require('pdf-parse');
const path = require('path');
const fs = require('fs');
const { getConnection } = require('../config/chatDb');
const { pool } = require('../config/db');
const upload = require('../middleware/uploadMiddleware');
const { checkDuplicate } = require('../controllers/uploadController');

// =============================================
// SSL WORKAROUND for corporate networks
// =============================================
const httpsAgent = new https.Agent({
  rejectUnauthorized: false
});

// =============================================
// GROQ API CALL (OpenAI-compatible format)
// =============================================
function callGroqAPI(payload) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(payload);
    
    const options = {
      hostname: 'api.groq.com',
      path: '/openai/v1/chat/completions',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
        'Content-Length': Buffer.byteLength(body)
      },
      agent: httpsAgent
    };
    
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (res.statusCode === 200) {
            resolve(parsed);
          } else {
            reject({ status: res.statusCode, data: parsed });
          }
        } catch (e) {
          reject({ status: res.statusCode, data: data });
        }
      });
    });
    
    req.on('error', (err) => {
      reject({ status: undefined, data: err.message });
    });
    
    req.write(body);
    req.end();
  });
}

// =============================================
// LANGUAGE DETECTION
// =============================================
const detectLanguage = (text) => {
  const tamilPattern = /[\u0B80-\u0BFF]/;
  const gujaratiPattern = /[\u0A80-\u0AFF]/;
  const hindiPattern = /[\u0900-\u097F]/;
  
  if (tamilPattern.test(text)) {
    const tamilChars = text.match(/[\u0B80-\u0BFF]/g);
    if (tamilChars && tamilChars.length > text.length * 0.3) return 'ta';
    return 'tl';
  }
  if (gujaratiPattern.test(text)) return 'gu';
  if (hindiPattern.test(text)) return 'hi';
  return 'en';
};

// =============================================
// SYSTEM PROMPT
// =============================================
const getSystemPrompt = async (lang, sessionId) => {
  const languageInstructions = {
    en: 'Reply in English.',
    ta: 'Reply in Tamil (தமிழில் பதில் அளிக்கவும்).',
    hi: 'Reply in Hindi (हिंदी में उत्तर दें).',
    gu: 'Reply in Gujarati (ગુજરાતીમાં જવાબ આપો).',
    tl: 'Reply in Tanglish (Tamil words written in English letters, like "Vanakkam, eppadi irukinga?").'
  };

  let pdfContextText = '';
  
  // Fetch PDF context if sessionId is provided
  if (sessionId) {
    try {
      const pool = await getConnection();
      const [contexts] = await pool.execute(
        'SELECT file_name, extracted_text FROM chat_session_context WHERE session_id = ? ORDER BY uploaded_at DESC',
        [sessionId]
      );
      await pool.end();
      
      if (contexts.length > 0) {
        pdfContextText = '\n\nUPLOADED PDF CONTEXT:\n';
        contexts.forEach((ctx, index) => {
          pdfContextText += `\n--- Document ${index + 1}: ${ctx.file_name} ---\n`;
          // Include first 3000 characters to avoid token limits
          pdfContextText += ctx.extracted_text.substring(0, 3000);
          if (ctx.extracted_text.length > 3000) {
            pdfContextText += '\n[Content truncated...]';
          }
        });
        pdfContextText += '\n\nUse the above PDF content to answer user questions about the document. If the question is not related to the PDF, answer normally.';
      }
    } catch (error) {
      console.error('Error fetching PDF context:', error);
    }
  }

  return `You are a friendly, helpful AI assistant for the "Engineering Drawing Analyzer" application. Your name is "Assistant".

ABOUT THE APPLICATION:
The Engineering Drawing Analyzer is a web app that helps engineers analyze piping and instrumentation drawings (PDFs). It extracts joint numbers, flanges, part numbers, and ME codes from uploaded PDF drawings.

KEY FEATURES:
1. Upload Page: Users drag & drop PDF files and click "Analyze" to extract data. Supports batch upload.
2. History Page: Shows all previously uploaded PDFs with analysis status (completed, failed, analyzing). Users can re-analyze, download results, or delete files.
3. Results Page: Displays extracted data in a table with columns: Joint Number, Flanges, Part Numbers, ME Code. Click a Joint Number to open Spotlight Mode.
4. Spotlight Mode: Interactive PDF viewer with zoom features:
   - Click to zoom in/out at mouse position
   - Double-click to toggle zoom
   - Ctrl + Scroll Wheel for smooth zoom
   - Ctrl + +/- for keyboard zoom shortcuts
   - Ctrl + 0 to reset zoom
   - Fit to Screen button
   - Speed Slider to control animation speed (200ms-1200ms)
   - Zoom range: 50% to 500%
   - Green highlights show flanges, part numbers, ME codes
   - Yellow spotlight highlights the selected joint number
5. Export to Excel: Download all analyzed data as .xlsx file
6. Re-Analyze: Re-process failed or corrected files from History page

TERMINOLOGY:
- Joint Number: Unique identifier for connection points (e.g., F-1003, F-1024). Detected in F-1000 to F-1999 range.
- Flanges: Connection points in piping system (e.g., F22, G26, B31). Highlighted in green in Spotlight Mode.
- Part Number (PT.No): Unique alphanumeric identifier for components.
- ME Code: Material/Engineering code (e.g., 1J7017, 1T1960). Displayed in monospace with blue background.

${pdfContextText}
${languageInstructions[lang] || 'Reply in English.'}

IMPORTANT RULES:
- Be friendly, helpful, and conversational like ChatGPT.
- Answer ANY question the user asks - both app-related and general questions.
- If the user asks about the application, provide accurate information based on the details above.
- If the user asks general questions (science, math, history, technology, etc.), answer them correctly.
- If the user asks in a specific language, reply in that same language.
- Keep responses clear and well-structured.
- Do NOT say you are an AI model - just be a helpful assistant.
- Do NOT refuse to answer general questions - you should answer everything like ChatGPT.`;
};

// =============================================
// CHAT API ENDPOINT
// =============================================
router.post('/message', async (req, res) => {
  try {
    const { message, conversationHistory, sessionId } = req.body;
    
    if (!message || !message.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Message is required'
      });
    }
    
    const lang = detectLanguage(message);
    const systemPrompt = await getSystemPrompt(lang, sessionId);
    
    // Build messages array with conversation history
    const messages = [{ role: 'system', content: systemPrompt }];
    
    // Add previous conversation context
    if (conversationHistory && Array.isArray(conversationHistory)) {
      for (const msg of conversationHistory) {
        if (msg.role === 'user' || msg.role === 'assistant') {
          messages.push({
            role: msg.role,
            content: msg.content
          });
        }
      }
    }
    
    // Add current user message
    messages.push({
      role: 'user',
      content: message
    });
    
    // Call Groq API
    const response = await callGroqAPI({
      model: 'llama-3.3-70b-versatile',
      messages: messages,
      max_tokens: 1024,
      temperature: 0.7
    });
    
    const responseText = response.choices[0].message.content;
    
    res.json({
      success: true,
      response: responseText,
      language: lang
    });
  } catch (error) {
    console.error('Chat API error:', error.data || error.message);
    
    if (error.status === 401) {
      return res.status(500).json({
        success: false,
        message: 'API authentication failed. Please check the API key configuration.',
        error: 'Authentication failed'
      });
    }
    
    if (error.status === 429) {
      return res.status(500).json({
        success: false,
        message: 'API rate limit exceeded. Please try again in a moment.',
        error: 'Rate limit exceeded'
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Failed to generate response. Please try again.',
      error: error.data || error.message
    });
  }
});

// =============================================
// UPLOAD PDF FOR CHAT CONTEXT
// =============================================
const chatUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      const uploadDir = path.join(__dirname, '..', 'uploads');
      if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
      cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
      cb(null, uniqueSuffix + '-' + file.originalname);
    }
  }),
  limits: { fileSize: 30 * 1024 * 1024 }, // 30MB limit
  fileFilter: (req, file, cb) => {
    if (file.mimetype !== 'application/pdf') {
      return cb(new Error('Only PDF files are allowed'), false);
    }
    cb(null, true);
  }
});

router.post('/context/pdf', chatUpload.single('pdf'), async (req, res) => {
  try {
    const { sessionId } = req.body;
    
    if (!sessionId) {
      return res.status(400).json({
        success: false,
        message: 'Session ID is required'
      });
    }
    
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'PDF file is required'
      });
    }
    
    // Extract text from PDF
    const pdfBuffer = fs.readFileSync(req.file.path);
    const pdfData = await pdfParse(pdfBuffer);
    const extractedText = pdfData.text;
    
    // Save context to database
    const pool = await getConnection();
    await pool.execute(
      'INSERT INTO chat_session_context (session_id, file_name, extracted_text) VALUES (?, ?, ?)',
      [sessionId, req.file.originalname, extractedText]
    );
    
    // Also save to main pdf_files table for tracking
    const [dbResult] = await pool.execute(
      'INSERT INTO pdf_files (file_name, stored_file_name, file_path, file_size, upload_status) VALUES (?, ?, ?, ?, ?)',
      [req.file.originalname, path.basename(req.file.path), path.join(__dirname, '..', 'uploads', path.basename(req.file.path)), req.file.size, 'completed']
    );
    const fileId = dbResult.insertId;
    
    await pool.end();
    
    // Clean up temp file
    fs.unlinkSync(req.file.path);
    
    res.json({
      success: true,
      message: 'PDF uploaded and processed successfully',
      fileId: fileId,
      fileName: req.file.originalname,
      textLength: extractedText.length,
      pages: pdfData.numpages
    });
  } catch (error) {
    console.error('PDF upload error:', error);
    
    // Clean up temp file if exists
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    
    res.status(500).json({
      success: false,
      message: 'Failed to process PDF file: ' + error.message,
      error: error.stack
    });
  }
});

// =============================================
// GET PDF CONTEXT FOR A SESSION
// =============================================
router.get('/context/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const pool = await getConnection();
    
    const [contexts] = await pool.execute(
      'SELECT * FROM chat_session_context WHERE session_id = ? ORDER BY uploaded_at DESC',
      [sessionId]
    );
    
    await pool.end();
    
    res.json({
      success: true,
      contexts: contexts
    });
  } catch (error) {
    console.error('Get context error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to load PDF context',
      error: error.message
    });
  }
});

// =============================================
// DELETE PDF CONTEXT FROM SESSION
// =============================================
router.delete('/context/:contextId', async (req, res) => {
  try {
    const { contextId } = req.params;
    const pool = await getConnection();
    
    await pool.execute(
      'DELETE FROM chat_session_context WHERE id = ?',
      [contextId]
    );
    
    await pool.end();
    
    res.json({
      success: true,
      message: 'PDF context removed successfully'
    });
  } catch (error) {
    console.error('Delete context error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to remove PDF context',
      error: error.message
    });
  }
});

module.exports = router;
