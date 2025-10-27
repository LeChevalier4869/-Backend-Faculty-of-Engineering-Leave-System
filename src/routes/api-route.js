const express = require('express');
const router = express.Router();
const apiController = require('../controllers/api-controller');
const reportController = require('../controllers/reportController');
const { authenticate , authorize } = require('../middlewares/auth');

//report
router.post('/download-report', authenticate,reportController.downloadReport);
router.get("/report/:organizationId", reportController.previewOrganizationReport);
router.post("/export/:organizationId", reportController.exportReport);

//contact admin
router.get("/contact", apiController.getContactInfo);
router.put("/contact/:key", authorize(["ADMIN"]), apiController.updateContactValue);

module.exports = router;
