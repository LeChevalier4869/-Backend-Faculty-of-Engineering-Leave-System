const express = require("express");
const router = express.Router();
const auditLogController = require("../controllers/auditLog-controller");
const { authenticate, authorize } = require("../middlewares/auth");

// ดึงข้อมูล Audit Log ทั้งหมด (สำหรับ Admin เท่านั้น)
router.get(
  "/all",
  authenticate,
  authorize(["ADMIN"]),
  auditLogController.getAllAuditLogs
);

// ดึงข้อมูลสถิติการกระทำ (สำหรับ Admin เท่านั้น)
router.get(
  "/stats",
  authenticate,
  authorize(["ADMIN"]),
  auditLogController.getActionStats
);

// ดึงข้อมูล Audit Log ตาม userId (สำหรับ Admin เท่านั้น)
router.get(
  "/user/:userId",
  authenticate,
  authorize(["ADMIN"]),
  auditLogController.getAuditLogsByUserId
);

// ดึงข้อมูล Audit Log ตาม leaveRequestId (สำหรับ Admin และผู้เกี่ยวข้อง)
router.get(
  "/leave-request/:leaveRequestId",
  authenticate,
  auditLogController.getAuditLogsByLeaveRequestId
);

// สร้าง Audit Log ใหม่ (สำหรับการทดสอบ ต้องเป็น Admin เท่านั้น)
router.post(
  "/",
  authenticate,
  authorize(["ADMIN"]),
  auditLogController.createAuditLog
);

// บันทึกการกระทำของผู้ใช้ (สำหรับระบบอัตโนมัติ ต้องเป็น Admin เท่านั้น)
router.post(
  "/log-action",
  authenticate,
  authorize(["ADMIN"]),
  auditLogController.logUserAction
);

module.exports = router;
