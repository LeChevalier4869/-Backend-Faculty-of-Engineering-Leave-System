const express = require("express");
const leaveBalanceController = require("../controllers/leaveBalance-controller");
const router = express.Router();
const { authorize, authenticate } = require("../middlewares/auth");

router.get("/", leaveBalanceController.getLeaveBalanceByUserId);
router.get("/me", leaveBalanceController.getLeaveBalanceMe);
router.get(
  "/leave-summary",
  authenticate,
  leaveBalanceController.getMyLeaveSummary
);

module.exports = router;
