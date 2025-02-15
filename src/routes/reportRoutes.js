const express = require('express');
const reportController = require('../controllers/reportController');
const router = express.Router();

router.post('/download-report', reportController.downloadReport);

module.exports = router;