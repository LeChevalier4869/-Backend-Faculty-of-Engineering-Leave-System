const express = require('express');
const LeaveTypeController = require('../controllers/leaveType-controller');
const router = express.Router();
const upload = require("../middlewares/upload");
const { authenticate, authorize } = require("../middlewares/auth");


router.post('/', authenticate, authorize(["ADMIN"]), LeaveTypeController.createLeaveType);
// router.put('/:id', LeaveTypeController.updateLeaveType);
router.put('/update/:id', authenticate, authorize(["ADMIN"]), upload.single('template'), LeaveTypeController.updateLeaveType);
router.delete('/:id', authenticate, authorize(["ADMIN"]), LeaveTypeController.deleteLeaveType);
router.get('/', authenticate, authorize(["ADMIN"]), LeaveTypeController.getAllLeaveType);
router.get('/type/:id', authenticate, authorize(["ADMIN"]), LeaveTypeController.getLeaveTypeById);
router.get('/available', LeaveTypeController.getAvailableLeaveTypes); // สาธารณะ - ไม่ต้อง login
// module.exports = router;



// router.get("/", LeaveTypeController.getAll);
// router.get("/:id", LeaveTypeController.getById);
// router.post("/", LeaveTypeController.create);
// router.put("/:id", LeaveTypeController.update);
// router.delete("/:id", LeaveTypeController.remove);

module.exports = router;
