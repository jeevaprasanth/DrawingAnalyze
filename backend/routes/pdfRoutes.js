const express = require('express');
const router = express.Router();
const path = require('path');
const pdfController = require('../controllers/pdfController');
const upload = require('../middleware/uploadMiddleware');
const { checkDuplicate } = require('../controllers/uploadController');
const { pool } = require('../config/db');
const { searchResults } = require('../controllers/resultsController');

// Serve PDF files statically by filename (for stored_file_name on disk)
router.get('/file/:fileName', (req, res) => {
  const { fileName } = req.params;
  const filePath = path.join(__dirname, '..', 'uploads', fileName);
  
  res.sendFile(filePath, (err) => {
    if (err) {
      return res.status(404).json({ success: false, message: 'PDF file not found' });
    }
  });
});

// Serve PDF files by database ID (always correct, avoids filename confusion)
router.get('/by-id/:fileId', async (req, res) => {
  try {
    const { fileId } = req.params;
    const [files] = await pool.execute(
      'SELECT stored_file_name FROM pdf_files WHERE id = ?',
      [fileId]
    );
    if (files.length === 0) {
      return res.status(404).json({ success: false, message: 'File not found' });
    }
    const filePath = path.join(__dirname, '..', 'uploads', files[0].stored_file_name);
    res.sendFile(filePath, (err) => {
      if (err) {
        return res.status(404).json({ success: false, message: 'PDF file not found on disk' });
      }
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
});

// POST /api/pdf/check-duplicate - Check if a file with the same name already exists
router.post('/check-duplicate', checkDuplicate);

// POST /api/pdf/upload - Upload up to 50 PDF files
router.post('/upload', upload.array("pdfs", 50), pdfController.uploadPDF);

// GET /api/pdf/files - Get all uploaded files
router.get('/files', pdfController.getFiles);

// DELETE /api/pdf/delete-all - Delete all files and related data
router.delete('/delete-all', pdfController.deleteAllFiles);

// DELETE /api/pdf/:fileId - Delete uploaded file
router.delete('/:fileId', pdfController.deleteFile);

// GET /api/results/search - Smart search across all components
router.get('/search', searchResults);

module.exports = router;
