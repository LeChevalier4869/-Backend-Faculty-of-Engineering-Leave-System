const express = require('express');
const router = express.Router();
const apiController = require('../controllers/api-controller');
const reportController = require('../controllers/reportController');
const { authenticate , authorize } = require('../middlewares/auth');

//report
router.post('/download-report', authenticate, reportController.downloadReport);
router.post("/report/data", authenticate, authorize(["ADMIN"]), reportController.reportData);
router.post("/report/data-month", authenticate, authorize(["ADMIN"]), reportController.getReportDataForMonth);

//export to pdf
router.post("/export-round-report", authenticate, authorize(["ADMIN"]), reportController.exportRoundReportPDF);
router.post("/export-year-report", authenticate, authorize(["ADMIN"]), reportController.exportFiscalYearReportPDF);
router.post("/export-month-report", authenticate, authorize(["ADMIN"]), reportController.exportMonthReportPDF);

//export report (pdf or word) - used by LeaveReport admin page
router.post("/export-report", authenticate, authorize(["ADMIN"]), reportController.exportReport);

//contact admin
router.get("/contact", apiController.getContactInfo);
router.put("/contact/:key", authenticate, authorize(["ADMIN"]), apiController.updateContactValue);

//dowload template from google drive
router.get("/dowload-template", apiController.getDriveLink);
router.put("/drive-link", apiController.updateDriveLink);

module.exports = router;
