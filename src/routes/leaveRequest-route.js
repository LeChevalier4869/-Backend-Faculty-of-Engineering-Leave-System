const express = require('express');
const leaveRequestController = require('../controllers/leaveRequest-controller');
const authMiddleware = require('../middlewares/auth');
const router = express.Router();

router.post('/', authMiddleware.authenticate, leaveRequestController.createLeaveRequest);
router.patch('/status', authMiddleware.authenticate, leaveRequestController.updateLeaveStatus);

module.exports = router;