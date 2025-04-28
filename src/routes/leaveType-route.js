const express = require('express');
const LeaveTypeController = require('../controllers/leaveType-controller');
const router = express.Router();

router.post('/', LeaveTypeController.createLeaveType);
router.put('/:id', LeaveTypeController.updateLeaveType);
router.delete('/:id', LeaveTypeController.deleteLeaveType);
router.get('/', LeaveTypeController.getAllLeaveType);
router.get('/type/:id', LeaveTypeController.getLeaveTypeById);
router.get('/available', LeaveTypeController.getAvailableLeaveTypes);
// module.exports = router;



// router.get("/", LeaveTypeController.getAll);
// router.get("/:id", LeaveTypeController.getById);
// router.post("/", LeaveTypeController.create);
// router.put("/:id", LeaveTypeController.update);
// router.delete("/:id", LeaveTypeController.remove);

module.exports = router;
