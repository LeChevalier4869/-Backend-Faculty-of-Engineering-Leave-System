const express = require("express");
const router = express.Router();
const proxyApprovalController = require("../controllers/proxyApproval-controller");
const authMiddleware = require("../middlewares/auth");

// ────────────────────────────────
// 🟢 CREATE
// ────────────────────────────────

// สร้างการมอบอำนาจให้ผู้อนุมัติแทน
router.post(
  "/",
  authMiddleware.authenticate,
  proxyApprovalController.createProxyApproval
);

// สร้างการมอบอำนาจรายวัน (สำหรับ admin)
router.post(
  "/daily",
  authMiddleware.authenticate,
  authMiddleware.authorize(["ADMIN"]),
  proxyApprovalController.createDailyProxyApproval
);

// ────────────────────────────────
// 🔎 READ
// ────────────────────────────────

// ดึงข้อมูลการมอบอำนาจทั้งหมด (Admin only)
router.get(
  "/",
  authMiddleware.authenticate,
  authMiddleware.authorize(["ADMIN"]),
  proxyApprovalController.getAllProxyApprovals
);

// ดึงข้อมูลการมอบอำนาจตาม ID
router.get(
  "/:id",
  authMiddleware.authenticate,
  proxyApprovalController.getProxyApprovalById
);

// ดึงข้อมูลการมอบอำนาจที่ผู้ใช้เป็นผู้อนุมัติต้นฉบับ
router.get(
  "/my/original",
  authMiddleware.authenticate,
  proxyApprovalController.getProxyApprovalsByOriginalApprover
);

// ดึงข้อมูลการมอบอำนาจที่ผู้ใช้เป็นผู้อนุมัติแทน
router.get(
  "/my/proxy",
  authMiddleware.authenticate,
  proxyApprovalController.getProxyApprovalsByProxyApprover
);

// ดึงข้อมูลการมอบอำนาจรายวันสำหรับวันที่กำหนด
router.get(
  "/daily/by-date",
  authMiddleware.authenticate,
  authMiddleware.authorize(["ADMIN"]),
  proxyApprovalController.getDailyProxyApprovalsByDate
);

// ดึงข้อมูลการมอบอำนาจรายวันทั้งหมดของผู้ใช้
router.get(
  "/my/daily",
  authMiddleware.authenticate,
  proxyApprovalController.getMyDailyProxyApprovals
);

// ตรวจสอบการมอบอำนาจที่ใช้ได้ในปัจจุบัน
router.get(
  "/active/check",
  authMiddleware.authenticate,
  proxyApprovalController.getActiveProxyApproval
);

// ตรวจสอบสิทธิ์การอนุมัติของผู้ใช้
router.get(
  "/permission/check",
  authMiddleware.authenticate,
  proxyApprovalController.checkApprovalPermission
);

// ดึงข้อมูลผู้อนุมัติที่เป็นไปได้
router.get(
  "/potential-approvers",
  authMiddleware.authenticate,
  proxyApprovalController.getPotentialApprovers
);

// ดึงข้อมูลสถิติการมอบอำนาจ
router.get(
  "/stats",
  authMiddleware.authenticate,
  authMiddleware.authorize(["ADMIN"]),
  proxyApprovalController.getProxyApprovalStats
);

// ────────────────────────────────
// 🔁 UPDATE
// ────────────────────────────────

// อัปเดตข้อมูลการมอบอำนาจ
router.put(
  "/:id",
  authMiddleware.authenticate,
  proxyApprovalController.updateProxyApproval
);

// ยกเลิกการมอบอำนาจ
router.patch(
  "/:id/cancel",
  authMiddleware.authenticate,
  proxyApprovalController.cancelProxyApproval
);

// อัปเดตสถานะการมอบอำนาจที่หมดอายุ (สำหรับ cron job)
router.patch(
  "/expire",
  authMiddleware.authenticate,
  authMiddleware.authorize(["ADMIN"]),
  proxyApprovalController.expireProxyApprovals
);

// ลบข้อมูลการมอบอำนาจรายวันที่หมดอายุ (cleanup)
router.delete(
  "/daily/cleanup",
  authMiddleware.authenticate,
  authMiddleware.authorize(["ADMIN"]),
  proxyApprovalController.cleanupExpiredDailyProxies
);

module.exports = router;
