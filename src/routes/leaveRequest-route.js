const express = require("express");
const leaveRequestController = require("../controllers/leaveRequest-controller");
const { authorize, authenticate } = require("../middlewares/auth");
const router = express.Router();
const { leaveRequestLimiter } = require('../middlewares/rateLimit');
const upload = require("../middlewares/upload");

router.get(
  "/get/:id",
  authenticate,
  authorize(["ADMIN", "APPROVER_1", "APPROVER_2", "APPROVER_3", "APPROVER_4", "VERIFIER", "RECEIVER"]),
  leaveRequestController.getLeaveRequest
);
router.get("/me", authenticate, leaveRequestController.getLeaveRequestIsMine);
router.post("/", leaveRequestLimiter, upload.array("images", 5), authenticate, leaveRequestController.createLeaveRequest);
router.patch("/:id", authenticate, leaveRequestController.updateLeaveRequest);
// update status unified
router.patch("/:id/status", upload.none(), authenticate, authorize(["ADMIN", "APPROVER_1", "APPROVER_2", "APPROVER_3", "APPROVER_4", "VERIFIER", "RECEIVER"]), leaveRequestController.updateLeaveStatus);
router.post("/:id/approve", authenticate, leaveRequestController.approveLeaveRequest);
router.post("/:id/reject", authenticate, leaveRequestController.rejectLeaveRequest);
router.delete("/:id", authenticate, leaveRequestController.deleteLeaveRequest);
router.get("/landing", leaveRequestController.getLeaveRequestLanding);

module.exports = router;
