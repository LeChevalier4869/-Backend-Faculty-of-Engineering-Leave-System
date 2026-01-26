const resetLeaveBalance = require('./src/utils/resetLeaveBalance.js');

console.log('🧪 เริ่มทดสอบการ reset Leave Balance...');
console.log('📅 วันที่ทดสอบ:', new Date().toISOString());

resetLeaveBalance()
  .then(() => {
    console.log('✅ ทดสอบเสร็จสิ้น');
  })
  .catch(err => {
    console.error('❌ เกิดข้อผิดพลาด:', err);
  });
