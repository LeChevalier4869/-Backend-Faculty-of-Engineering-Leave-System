const express = require("express");
const leaveRequestController = require("../controllers/leaveRequest-controller");
const { authorize, authenticate } = require("../middlewares/auth");
const { leaveRequestLimiter } = require('../middlewares/rateLimit');
const upload = require("../middlewares/upload");

const router = express.Router();

// Create a new leave request (up to 5 attachments)
/* router.post(
  "/",
  authenticate,
  leaveRequestLimiter,
  upload.array("images", 5),
  leaveRequestController.createLeaveRequest
); */

router.get("/", authenticate, authorize(["ADMIN"]), leaveRequestController.getAllLeaveRequests);

router.get(
  "/me",
  authenticate,
  leaveRequestController.getLeaveRequestIsMine
);

// Get a specific leave request by ID (authorized roles)
router.get(
  "/:id",
  authenticate,
  authorize(["ADMIN","APPROVER_1","APPROVER_2","APPROVER_3","APPROVER_4","VERIFIER","RECEIVER"]),
  leaveRequestController.getLeaveRequest
);

// Update own leave request
router.patch(
  "/:id",
  authenticate,
  leaveRequestController.updateLeaveRequest
);

// Update status (admin/approver/verifier/receiver)
router.patch(
  "/:id/status",
  authenticate,
  authorize(["ADMIN","APPROVER_1","APPROVER_2","APPROVER_3","APPROVER_4","VERIFIER","RECEIVER"]),
  leaveRequestController.updateLeaveStatus
);

// Approve leave
router.post(
  "/:id/approve",
  authenticate,
  authorize(["APPROVER_1","APPROVER_2","APPROVER_3","APPROVER_4"]),
  leaveRequestController.approveLeaveRequest
);

// Reject leave
router.post(
  "/:id/reject",
  authenticate,
  authorize(["APPROVER_1","APPROVER_2","APPROVER_3","APPROVER_4"]),
  leaveRequestController.rejectLeaveRequest
);

// Delete a leave request
router.delete(
  "/:id",
  authenticate,
  leaveRequestController.deleteLeaveRequest
);

// Summary data for dashboard
router.get(
  "/landing",
  authenticate,
  leaveRequestController.getLeaveRequestLanding
);

module.exports = router;