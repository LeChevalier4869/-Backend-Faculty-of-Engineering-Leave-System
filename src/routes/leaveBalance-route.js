const express = require('express');
const leaveBalanceController = require('../controllers/leaveBalance-controller');
const router = express.Router();

router.get('/', leaveBalanceController.getLeaveBalanceByUserId);

module.exports = router;