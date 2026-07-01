const express = require('express');
const router = express.Router();
const dashboardController = require('../controllers/dashboardController');

// GET /api/history - Get upload history
router.get('/', dashboardController.getHistory);

module.exports = router;

