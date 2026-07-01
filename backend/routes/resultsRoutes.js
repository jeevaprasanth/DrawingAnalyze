const express = require('express');
const router = express.Router();
const resultsController = require('../controllers/resultsController');

// GET /api/results/export/all - Export all results as flat array
router.get('/export/all', resultsController.exportAllResults);

// POST /api/results/export/selected - Export selected files' results
router.post('/export/selected', resultsController.exportSelectedResults);

// GET /api/results - Get all results across all files
router.get('/', resultsController.getAllResults);

// GET /api/results/:fileId - Get analysis results for a file
router.get('/:fileId', resultsController.getResults);

module.exports = router;
