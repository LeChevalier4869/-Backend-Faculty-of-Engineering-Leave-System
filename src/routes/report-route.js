const express = require('express');
const ReportService = require('../services/report-service');
const router = express.Router();

router.get('/reports/leave-summary', async (req, res, next) => {
  try {
    const data = await ReportService.getLeaveSummary();
    res.json({ data });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
