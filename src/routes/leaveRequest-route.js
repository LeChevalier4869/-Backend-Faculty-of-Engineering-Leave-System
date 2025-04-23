const express = require("express");
const leaveRequestController = require("../controllers/leaveRequest-controller");
const { authorize, authenticate } = require("../middlewares/auth");
const { leaveRequestLimiter } = require("../middlewares/rateLimit");
const upload = require("../middlewares/upload");

const router = express.Router();

// Create a new leave request (up to 5 attachments)
router.post(
  "/",
  authenticate,
  leaveRequestLimiter,
  upload.array("images", 5),
  leaveRequestController.createLeaveRequest
);

router.get(
  "/",
  authenticate,
  authorize(["ADMIN"]),
  leaveRequestController.getAllLeaveRequests
);

router.get("/me", authenticate, leaveRequestController.getLeaveRequestIsMine);

// Get a specific leave request by ID (authorized roles)
router.get(
  "/getLeaveRequest/:id",
  authenticate,
  authorize([
    "ADMIN",
    "APPROVER_1",
    "APPROVER_2",
    "APPROVER_3",
    "APPROVER_4",
    "VERIFIER",
    "RECEIVER",
  ]),
  leaveRequestController.getLeaveRequest
);

// Update own leave request
router.patch("/:id", authenticate, leaveRequestController.updateLeaveRequest);

// Update status (admin/approver/verifier/receiver)
router.patch(
  "/:id/status",
  authenticate,
  authorize([
    "ADMIN",
    "APPROVER_1",
    "APPROVER_2",
    "APPROVER_3",
    "APPROVER_4",
    "VERIFIER",
    "RECEIVER",
  ]),
  leaveRequestController.updateLeaveStatus
);

// Approve leave
router.post(
  "/:id/approve",
  authenticate,
  authorize([
    "APPROVER_1",
    "APPROVER_2",
    "APPROVER_3",
    "APPROVER_4",
    "VERIFIER",
  ]),
  leaveRequestController.approveLeaveRequest
);

// Reject leave
router.post(
  "/:id/reject",
  authenticate,
  authorize([
    "APPROVER_1",
    "APPROVER_2",
    "APPROVER_3",
    "APPROVER_4",
    "VERIFIER",
  ]),
  leaveRequestController.rejectLeaveRequest
);

// Delete a leave request
router.delete("/:id", authenticate, leaveRequestController.deleteLeaveRequest);

// Summary data for dashboard
router.get(
  "/landing",
  authenticate,
  leaveRequestController.getLeaveRequestLanding
);

// ────────────────────────────────
// 🟢 GET REQUEST FOR APPROVER
// ────────────────────────────────

// get request for head of department (step 1)
router.get(
  "/for-approver1",
  authenticate,
  authorize(["APPROVER_1"]),
  leaveRequestController.getLeaveRequestsForFirstApprover
);

// get request for verifier (step 2)
router.get(
  "/for-verifier",
  authenticate,
  authorize(["VERIFIER"]),
  leaveRequestController.getLeaveRequestsForVerifier
);

// get request for receiver (step 3)
router.get(
  "/for-receiver",
  authenticate,
  authorize(["RECEIVER"]),
  leaveRequestController.getLeaveRequestsForReceiver
);

// get request for approver 2 (step 4)
router.get(
  "/for-approver2",
  authenticate,
  authorize(["APPROVER_2"]),
  leaveRequestController.getLeaveRequestsForSecondApprover
);

// get request for approver 3 (step 5)
router.get(
  "/for-approver3",
  authenticate,
  authorize(["APPROVER_3"]),
  leaveRequestController.getLeaveRequestsForThirdApprover
);

//get request for approver 4 (step 6: last step)
router.get(
  "/for-approver4",
  authenticate,
  authorize(["APPROVER_4"]),
  leaveRequestController.getLeaveRequestsForFourthApprover
);

//approve and reject for approver 1
router.patch(
  "/:id/approve-by-approver1",
  authenticate,
  authorize(["APPROVER_1"]),
  leaveRequestController.approveByFirstApprover
);
router.patch(
  "/:id/reject-by-approver1",
  authenticate,
  authorize(["APPROVER_1"]),
  leaveRequestController.rejectByFirstApprover
);

module.exports = router;
