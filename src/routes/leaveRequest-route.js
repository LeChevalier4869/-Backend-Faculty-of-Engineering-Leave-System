const express = require("express");
const leaveRequestController = require("../controllers/leaveRequest-controller");
const { authorize } = require("../middlewares/auth");
const router = express.Router();
const { leaveRequestLimiter } = require('../middlewares/rateLimit');

router.get(
  "/",
  authorize(["ADMIN", "APPROVER_1", "APPROVER_2", "APPROVER_3", "APPROVER_4"]),
  leaveRequestController.getLeaveRequest
);
router.get("/me", leaveRequestController.getLeaveRequestIsMine);
router.post("/", leaveRequestLimiter, leaveRequestController.createLeaveRequest);
router.patch("/:id", leaveRequestController.updateLeaveRequest);
router.patch("/status", leaveRequestController.updateLeaveStatus);
router.post("/:id/approve", leaveRequestController.approveLeaveRequest);
router.post("/:id/reject", leaveRequestController.rejectLeaveRequest);
router.delete("/:id", leaveRequestController.deleteLeaveRequest);
router.get("/landing", leaveRequestController.getLeaveRequestLanding);

module.exports = router;
