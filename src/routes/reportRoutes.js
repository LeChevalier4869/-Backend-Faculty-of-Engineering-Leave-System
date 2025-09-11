const express = require('express');
const reportController = require('../controllers/reportController');
const router = express.Router();
const { authenticate } = require('../middlewares/auth');

router.post('/download-report', authenticate,reportController.downloadReport);
router.get("/preview/:userId", reportController.previewReport);
router.put("/update/:id", reportController.editReport);
router.get("/pdf/:userId", reportController.generateReportPdf);

module.exports = router;