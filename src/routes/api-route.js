const express = require('express');
const router = express.Router();
const apiController = require('../controllers/api-controller');
const reportController = require('../controllers/reportController');
const { authenticate , authorize } = require('../middlewares/auth');

//report
router.post('/download-report', authenticate, reportController.downloadReport);
router.post("/report/data", authenticate, reportController.reportData);

//report data
router.get("/report/data-month", authenticate, reportController.getReportDataForMonth);
router.get("/report/fiscal-data", authenticate, reportController.getFiscalReportData);
// พรีวิวแยกของทีม (คงไว้เพื่อความเข้ากันได้)
router.get("/report/data-fiscal", authenticate, reportController.getReportDataForFiscalYear);
router.get("/report/data-round", authenticate, reportController.getReportDataForRound);

//export to pdf
router.post("/export-round-report-pdf", authenticate, reportController.exportRoundReportPDF);
router.post("/export-year-report-pdf", authenticate, reportController.exportFiscalYearReportPDF);
router.post("/export-month-report-pdf", authenticate, reportController.exportMonthReportPDF);

//export to word
router.post("/export-round-report-word", authenticate, reportController.exportRoundReportWORD);
router.post("/export-year-report-word", authenticate, reportController.exportFiscalYearReportWORD);
router.post("/export-month-report-word", authenticate, reportController.exportMonthReportWORD);

//export report (pdf or word) - used by LeaveReport admin page
router.post("/export-report", authenticate, authorize(["ADMIN"]), reportController.exportReport);

//contact admin
router.get("/contact", apiController.getContactInfo);
router.put("/contact/:key", authenticate, authorize(["ADMIN"]), apiController.updateContactValue);

//dowload template from google drive
router.get("/dowload-template", apiController.getDriveLink);
router.put("/drive-link", apiController.updateDriveLink);

module.exports = router;
