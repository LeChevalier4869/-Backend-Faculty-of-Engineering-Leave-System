const cron = require('node-cron');
const prisma = require("../config/prisma");
const UserService = require("../services/user-service");

async function resetLeaveBalance() {
  try {
    const users = await prisma.user.findMany();

    for (const user of users) {
      // 1. อัปเดต rank ใหม่ตาม personnelType + hireDate
      await UserService.assignRankToUser(
        user.id,
        user.personnelTypeId,
        user.hireDate
      );

      // 2. สร้าง leave balance ใหม่ตาม rank ที่อัปเดต
      await UserService.assignLeaveBalanceFromRanks(user.id);
    }

    console.log(`✅ Leave Balance ถูกตั้งค่าตาม rank ใหม่เมื่อเริ่มปีงบประมาณ`);
  } catch (error) {
    console.error("❌ Error resetting leave balances:", error);
  }
}

//             🔁 ทำงานทุกวันที่ 1 ต.ค. เวลา 00:00
//             ┌───────────── นาที (0 - 59)
//             │ ┌───────────── ชั่วโมง (0 - 23)
//             │ │ ┌───────────── วันที่ของเดือน (1 - 31)
//             │ │ │ ┌───────────── เดือน (1 - 12)
//             │ │ │ │  ┌───────────── วันในสัปดาห์ (0 - 7) (อาทิตย์คือ 0 หรือ 7)
//             │ │ │ │  │
//             │ │ │ │  │
//             * * * *  *
cron.schedule('0 0 1 10 *', async () => {
  console.log('🕛 เริ่มตั้งค่า Leave Balance (1 ต.ค.)');
  await resetLeaveBalance();
});
