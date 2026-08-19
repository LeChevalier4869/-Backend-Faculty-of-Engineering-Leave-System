const express = require("express");
const leaveRequestController = require("../controllers/leaveRequest-controller");
const { authenticate, authorize, optionalAuth } = require("../middlewares/auth");
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

router.get('/my-requests', authenticate, leaveRequestController.getMyLeaveRequests);
router.get('/my-requests/approved', authenticate, leaveRequestController.getMyApprovedLeaveRequests);

router.get("/me", authenticate, leaveRequestController.getLeaveRequestIsMine);
router.get("/last-request/me", authenticate, leaveRequestController.getMyLastApprovedLeaveRequest);
router.post("/last/type/:userId", authenticate, leaveRequestController.getLastLeaveBefore);

// Get a specific leave request by ID (authorized roles)
router.get(
  "/getLeaveRequest/:id",
  authenticate,
  leaveRequestController.getLeaveRequest
);

// Update own leave request
router.patch("/:id", authenticate, leaveRequestController.updateLeaveRequest);

// Update status (admin/approver/verifier)
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
  ]),
  leaveRequestController.updateLeaveStatus
);

// Delete a leave request
router.delete("/:id", authenticate, leaveRequestController.deleteLeaveRequest);

router.get("/user/:id", authenticate, leaveRequestController.getLeaveRequestsByUserId);

// ────────────────────────────────
// 🟢 GET REQUEST FOR APPROVER
// ────────────────────────────────
//
// หมายเหตุ (สำคัญ): เส้นทางกลุ่มอนุมัติ/ปฏิเสธด้านล่างตั้งใจไม่ใส่ authorize(["APPROVER_x"])
// เพราะ "ผู้รับมอบอำนาจ" (ProxyApproval) ไม่ได้ถือบทบาทนั้นจริง จะถูก authorize ปัดตกทันที
// การตรวจสิทธิ์จึงทำที่ชั้น service ด้วย LeaveRequestService.assertApproverPermission()
// ซึ่งใช้ getApproversForLevel() ที่นับผู้รับมอบอำนาจด้วย
// -> อย่าเปิด authorize() กลับมา เพราะจะทำให้ระบบมอบอำนาจใช้ไม่ได้

//get all request for department
router.get(
  "/department",
  authenticate,
  leaveRequestController.getAllLeaveRequestsInDepartment
);
// get request for head of department (step 1)
router.get(
  "/for-approver1",
  authenticate,
  // authorize(["APPROVER_1"]), // ไม่ใช้ authorize ตรงๆ ให้ controller จัดการ
  leaveRequestController.getLeaveRequestsForFirstApprover
);

// get request for verifier (step 2)
router.get(
  "/for-verifier",
  authenticate, // ใช้ authenticate สำหรับ frontend
  leaveRequestController.getLeaveRequestsForVerifier
);

// get request for approver 2 (step 4)
router.get(
  "/for-approver2",
  authenticate,
  // authorize(["APPROVER_2"]), // ไม่ใช้ authorize ตรงๆ ให้ controller จัดการ
  leaveRequestController.getLeaveRequestsForSecondApprover
);

// get request for approver 3 (step 5)
router.get(
  "/for-approver3",
  authenticate,
  // authorize(["APPROVER_3"]), // ไม่ใช้ authorize ตรงๆ ให้ controller จัดการ
  leaveRequestController.getLeaveRequestsForThirdApprover
);

//get request for approver 4 (step 6: last step)
router.get(
  "/for-approver4",
  authenticate,
  // authorize(["APPROVER_4"]), // ไม่ใช้ authorize ตรงๆ ให้ controller จัดการ
  leaveRequestController.getLeaveRequestsForFourthApprover
);

//approve and reject for approver 1
router.patch(
  "/:id/approve-by-approver1",
  authenticate,
  // authorize(["APPROVER_1"]), // ไม่ใช้ authorize ตรงๆ ให้ controller จัดการ
  leaveRequestController.approveByFirstApprover
);
router.patch(
  "/:id/reject-by-approver1",
  authenticate,
  // authorize(["APPROVER_1"]), // ไม่ใช้ authorize ตรงๆ ให้ controller จัดการ
  leaveRequestController.rejectByFirstApprover
);

//approve and reject for Verifier
router.patch(
  "/:id/approve-by-verifier",
  authenticate,
  // authorize(["VERIFIER"]), // ไม่ใช้ authorize ตรงๆ ให้ controller จัดการ
  leaveRequestController.approveByVerifier
);
router.patch(
  "/:id/reject-by-verifier",
  authenticate,
  // authorize(["VERIFIER"]), // ไม่ใช้ authorize ตรงๆ ให้ controller จัดการ
  leaveRequestController.rejectByVerifier
);

//approve and reject for Approver 2
router.patch(
  "/:id/approve-by-approver2",
  authenticate,
  // authorize(["APPROVER_2"]), // ไม่ใช้ authorize ตรงๆ ให้ controller จัดการ
  leaveRequestController.approveBySecondApprover
);
router.patch(
  "/:id/reject-by-approver2",
  authenticate,
  // authorize(["APPROVER_2"]), // ไม่ใช้ authorize ตรงๆ ให้ controller จัดการ
  leaveRequestController.rejectBySecondApprover
);

//approve and reject for Approver 3
router.patch(
  "/:id/approve-by-approver3",
  authenticate,
  // authorize(["APPROVER_3"]), // ไม่ใช้ authorize ตรงๆ ให้ controller จัดการ
  leaveRequestController.approveByThirdApprover
);
router.patch(
  "/:id/reject-by-approver3",
  authenticate,
  // authorize(["APPROVER_3"]), // ไม่ใช้ authorize ตรงๆ ให้ controller จัดการ
  leaveRequestController.rejectByThirdApprover
);

//approve and reject for Approver 4
router.patch(
  "/:id/approve-by-approver4",
  authenticate,
  // authorize(["APPROVER_4"]), // ไม่ใช้ authorize ตรงๆ ให้ controller จัดการ
  leaveRequestController.approveByFourthApprover
);
router.patch(
  "/:id/reject-by-approver4",
  authenticate,
  // authorize(["APPROVER_4"]), // ไม่ใช้ authorize ตรงๆ ให้ controller จัดการ
  leaveRequestController.rejectByFourthApprover
);

// ────────────────────────────────
// 🚫 ADMIN CANCEL LEAVE REQUEST
// ────────────────────────────────

// Admin cancel leave request by document number
router.post(
  "/admin/cancel",
  authenticate,
  authorize(["ADMIN"]),
  upload.array("paperFiles", 3), // รับไฟล์ paper สูงสุด 3 ไฟล์
  leaveRequestController.adminCancelLeaveRequest
);

// Search leave request by document number (for admin)
router.get(
  "/admin/search/:documentNumber",
  authenticate,
  authorize(["ADMIN"]),
  leaveRequestController.findLeaveRequestByNumber
);

module.exports = router;
