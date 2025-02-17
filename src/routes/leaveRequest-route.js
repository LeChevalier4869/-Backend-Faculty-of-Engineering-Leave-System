const express = require("express");
const leaveRequestController = require("../controllers/leaveRequest-controller");
const { authenticate, authorize } = require("../middlewares/auth");
const router = express.Router();
const upload = require("../middlewares/upload");

router.get(
  "/get/:id",
  authenticate,
  authorize(["ADMIN", "APPROVER_1", "APPROVER_2", "APPROVER_3", "APPROVER_4", "VERIFIER", "RECEIVER"]),
  leaveRequestController.getLeaveRequest
);

// router.post('/register', upload.single('images'), authController.register);
router.get("/me", authenticate, leaveRequestController.getLeaveRequestIsMine);
router.post("/", upload.array("images", 5), authenticate, leaveRequestController.createLeaveRequest);
router.patch("/:id", authenticate, leaveRequestController.updateLeaveRequest);
router.patch("/status", authenticate, leaveRequestController.updateLeaveStatus);
router.post("/:id/approve", authenticate, leaveRequestController.approveLeaveRequest);
router.post("/:id/reject", authenticate, leaveRequestController.rejectLeaveRequest);
router.delete("/:id", authenticate, leaveRequestController.deleteLeaveRequest);
router.get("/landing", authenticate, leaveRequestController.getLeaveRequestLanding);

module.exports = router;
