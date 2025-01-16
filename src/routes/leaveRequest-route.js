const express = require('express');
const leaveRequestController = require('../controllers/leaveRequest-controller');
const router = express.Router();

router.get('/', leaveRequestController.getLeaveRequest);
router.get('/me', leaveRequestController.getLeaveRequestIsMine);
router.post('/', leaveRequestController.createLeaveRequest);
router.patch('/:id', leaveRequestController.updateLeaveRequest);
router.patch('/status', leaveRequestController.updateLeaveStatus);
router.post('/:id/approve', leaveRequestController.approveLeaveRequest);
router.post('/:id/reject', leaveRequestController.rejectLeaveRequest);
router.delete('/:id', leaveRequestController.deleteLeaveRequest);

module.exports = router;