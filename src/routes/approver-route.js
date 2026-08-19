const express = require("express");
const router = express.Router();
const approverOversight = require("../controllers/approverOversight-controller");

// mounted ที่ /approver (มี authenticate จาก app.js) — สิทธิ์คุมด้วย resolveScope ใน controller
// ขอบเขตขึ้นกับบทบาทผู้อนุมัติที่ถือ (ระดับคณะ vs ระดับสาขา)

// ข้อมูลขอบเขตที่ดูแล (คณะ/สาขา)
router.get("/oversight/scope", approverOversight.getScope);

// รายชื่อผู้ใช้ในความดูแล
router.get("/oversight/users", approverOversight.listUsers);

// คำขอลาของผู้ใช้ในความดูแล (สำหรับสถิติ dashboard)
router.get("/oversight/leave-requests", approverOversight.listLeaveRequests);

// รายละเอียดผู้ใช้: โปรไฟล์ + ยอดวันลา + ประวัติการลา
router.get("/oversight/users/:userId", approverOversight.getUserDetail);

module.exports = router;
