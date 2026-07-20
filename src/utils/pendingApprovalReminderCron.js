const cron = require("node-cron");
const { sendPendingApprovalReminders } = require("./pendingApprovalReminder");

// จำนวนวันที่ถือว่าคำขอ "ค้าง" (ปรับผ่าน env ได้)
const THRESHOLD_DAYS = parseInt(process.env.PENDING_REMINDER_DAYS || "3", 10);

/**
 * Cron: เตือนผู้อนุมัติที่มีคำขอลาค้างเกิน THRESHOLD_DAYS วัน
 * ทำงานทุกวันเวลา 08:00 ตามเวลาประเทศไทย
 */
cron.schedule(
  "0 8 * * *",
  async () => {
    try {
      console.log("🔔 [CRON] เริ่มส่งอีเมลเตือนคำขอลาที่ค้างพิจารณา...");
      const result = await sendPendingApprovalReminders(THRESHOLD_DAYS);
      console.log(
        `✅ [CRON] ส่งเตือนเสร็จสิ้น: ผู้อนุมัติ ${result.approvers} คน, ส่งอีเมล ${result.emailsSent} ฉบับ (เกิน ${result.thresholdDays} วัน)`
      );
    } catch (error) {
      console.error("❌ [CRON] เตือนคำขอค้างล้มเหลว:", error.message);
    }
  },
  { timezone: "Asia/Bangkok" }
);
