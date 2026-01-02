const cron = require("node-cron");
const ProxyApprovalService = require("../services/proxyApproval-service");

/**
 * Cron Job สำหรับจัดการการมอบอำนาจรายวัน
 * 
 * 1. อัปเดตสถานะการมอบอำนาจรายวันที่ผ่านมาแล้วให้เป็น EXPIRED (ทุกวันเวลา 00:05)
 * 2. ลบข้อมูลการมอบอำนาจรายวันที่หมดอายุเกิน 7 วัน (ทุกวันเวลา 02:00)
 */

// อัปเดตสถานะการมอบอำนาจที่หมดอายุ - ทำงานทุกวันเวลา 00:05
cron.schedule("5 0 * * *", async () => {
  try {
    console.log("🔄 [CRON] เริ่มตรวจสอบการหมดอายุของการมอบอำนาจ...");
    
    const result = await ProxyApprovalService.expireProxyApprovals();
    
    console.log(`✅ [CRON] ตรวจสอบการหมดอายุของการมอบอำนาจเสร็จสิ้น:`);
    console.log(`   - การมอบอำนาจแบบช่วงเวลาที่หมดอายุ: ${result.periodProxies.count}`);
    console.log(`   - การมอบอำนาจรายวันที่หมดอายุ: ${result.dailyProxies.count}`);
    console.log(`   - รวมทั้งหมดที่หมดอายุ: ${result.totalExpired}`);
    
  } catch (error) {
    console.error("❌ [CRON] เกิดข้อผิดพลาดในการตรวจสอบการหมดอายุของการมอบอำนาจ:", error.message);
    
    // ใน production ควรมีการแจ้งเตือน
    if (process.env.NODE_ENV === 'production') {
      // TODO: เพิ่มการแจ้งเตือนผ่าน email หรือ monitoring system
      console.error("🚨 [CRITICAL] Cron job failed - Please check system immediately");
    }
  }
}, {
  scheduled: true,
  timezone: "Asia/Bangkok"
});

// ลบข้อมูลการมอบอำนาจรายวันที่หมดอายุเกิน 7 วัน - ทำงานทุกวันเวลา 02:00
cron.schedule("0 2 * * *", async () => {
  try {
    console.log("🧹 [CRON] เริ่มทำความสะอาดข้อมูลการมอบอำนาจรายวัน...");
    
    const result = await ProxyApprovalService.cleanupExpiredDailyProxies(7);
    
    console.log(`✅ [CRON] ทำความสะอาดข้อมูลการมอบอำนาจรายวันเสร็จสิ้น:`);
    console.log(`   - จำนวนรายการที่ถูกลบ: ${result.count}`);
    
  } catch (error) {
    console.error("❌ [CRON] เกิดข้อผิดพลาดในการทำความสะอาดข้อมูลการมอบอำนาจรายวัน:", error.message);
    
    // ใน production ควรมีการแจ้งเตือน
    if (process.env.NODE_ENV === 'production') {
      // TODO: เพิ่มการแจ้งเตือนผ่าน email หรือ monitoring system
      console.error("🚨 [CRITICAL] Cleanup cron job failed - Please check system immediately");
    }
  }
}, {
  scheduled: true,
  timezone: "Asia/Bangkok"
});

console.log("🕐 [CRON] ตั้งค่า cron job สำหรับการจัดการการมอบอำนาจ:");
console.log("   - ตรวจสอบการหมดอายุ: 00:05 ทุกวัน (Asia/Bangkok)");
console.log("   - ทำความสะอาดข้อมูล: 02:00 ทุกวัน (Asia/Bangkok)");

module.exports = {
  // Export functions สำหรับการทดสอบ
  runExpirationCheck: async () => {
    return await ProxyApprovalService.expireProxyApprovals();
  },
  
  runCleanupTask: async (daysToKeep = 7) => {
    return await ProxyApprovalService.cleanupExpiredDailyProxies(daysToKeep);
  }
};
