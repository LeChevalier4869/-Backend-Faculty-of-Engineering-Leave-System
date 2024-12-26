const express = require('express');
const LeaveTypeController = require('../controllers/leaveType-controller');
const router = express.Router();

router.post('/', LeaveTypeController.createLeaveType);
router.put('/:id', LeaveTypeController.updateLeaveType);
router.delete('/:id', LeaveTypeController.deleteLeaveType);
router.get('/', LeaveTypeController.getAllLeaveType);
router.get('/:id', LeaveTypeController.getLeaveTypeById);

module.exports = router;