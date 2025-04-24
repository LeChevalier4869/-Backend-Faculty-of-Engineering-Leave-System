const express = require('express');
const leaveBalanceController = require('../controllers/leaveBalance-controller');
const router = express.Router();

router.get('/', leaveBalanceController.getLeaveBalanceByUserId);
router.get('/me', leaveBalanceController.getLeaveBalanceMe);

module.exports = router;