const express = require('express');
const reportController = require('../controllers/reportController');
const router = express.Router();
const { authenticate } = require('../middlewares/auth');

router.post('/download-report', authenticate,reportController.downloadReport);
router.get("/report/:organizationId", reportController.previewOrganizationReport);
router.post("/export/:organizationId", reportController.exportReport);

module.exports = router;