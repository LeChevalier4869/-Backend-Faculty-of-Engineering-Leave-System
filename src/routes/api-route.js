const express = require('express');
const router = express.Router();
const apiController = require('../controllers/api-controller');
const reportController = require('../controllers/reportController');
const { authenticate , authorize } = require('../middlewares/auth');

//report
router.post('/download-report', authenticate, reportController.downloadReport);
router.post("/report/data", reportController.reportData);
router.post("/report/data-month", reportController.getReportDataForMonth);

//export to pdf
router.post("/export-round-report", reportController.exportRoundReportPDF);
router.post("/export-year-report", reportController.exportFiscalYearReportPDF);
router.post("/export-month-report", reportController.exportMonthReportPDF);

//contact admin
router.get("/contact", apiController.getContactInfo);
router.put("/contact/:key", authenticate, authorize(["ADMIN"]), apiController.updateContactValue);

//dowload template from google drive
router.get("/dowload-template", apiController.getDriveLink);
router.put("/drive-link", apiController.updateDriveLink);

module.exports = router;
