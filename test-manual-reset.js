#!/usr/bin/env node

const resetLeaveBalance = require('./src/utils/resetLeaveBalance');

/**
 * Test script for manual leave balance reset
 * Usage: node test-manual-reset.js
 */

async function testManualReset() {
  console.log("🚀 เริ่มการทดสอบการรีเซ็ต Leave Balance ด้วยตนเอง");
  console.log("⏰ เวลา:", new Date().toISOString());
  
  try {
    await resetLeaveBalance();
    console.log("✅ การรีเซ็ต Leave Balance สำเร็จ!");
    console.log("⏰ เสร็จสิ้นเวลา:", new Date().toISOString());
  } catch (error) {
    console.error("❌ เกิดข้อผิดพลาดในการรีเซ็ต:", error);
    process.exit(1);
  }
}

// ถ้ารันแบบ standalone
if (require.main === module) {
  testManualReset();
}

module.exports = testManualReset;
