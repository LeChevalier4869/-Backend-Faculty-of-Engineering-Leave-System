const express = require('express');
const leaveRequestController = require('../controllers/leaveRequest-controller');
const authMiddleware = require('../middlewares/auth');
const router = express.Router();

router.get('/', authMiddleware.authenticate, leaveRequestController.getLeaveRequest);
router.post('/', authMiddleware.authenticate, leaveRequestController.createLeaveRequest);
router.patch('/:requestId', authMiddleware.authenticate, leaveRequestController.updateLeaveRequest);
router.patch('/status', authMiddleware.authenticate, leaveRequestController.updateLeaveStatus);

module.exports = router;