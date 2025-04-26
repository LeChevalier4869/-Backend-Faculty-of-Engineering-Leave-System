const cron = require('node-cron');
const prisma = require("../config/prisma");
const UserService = require("../services/user-service");

// async function resetLeaveBalance() {
//   console.log("🔄 กำลังรีเซ็ตข้อมูล Leave Balance");

//   // 1. ลบข้อมูล user_Rank ทั้งหมด
//   await prisma.user_Rank.deleteMany({});
//   console.log("🧹 ลบข้อมูล user_Rank เรียบร้อย");

//   // 2. ลบ LeaveBalance ทั้งหมด
//   await prisma.leaveBalance.deleteMany({});
//   console.log("🧹 ลบข้อมูล leaveBalance เรียบร้อย");

//   // 3. ดึงผู้ใช้งานทั้งหมดพร้อม personnelType และ hireDate
//   const users = await prisma.user.findMany({
//     select: {
//       id: true,
//       personnelTypeId: true,
//       hireDate: true,
//     },
//   });

//   // 4. วนลูปสร้าง user_Rank และ leaveBalance ใหม่
//   for (const user of users) {
//     const { id, personnelTypeId, hireDate } = user;

//     // ตรวจสอบว่ามีข้อมูลครบ
//     if (!personnelTypeId || !hireDate) continue;

//     // สร้าง user_Rank ใหม่
//     await UserService.assignRankToUser(id, personnelTypeId, new Date(hireDate));

//     // สร้าง leaveBalance ใหม่จาก rank
//     await UserService.assignLeaveBalanceFromRanks(id);
//   }

//   console.log("✅ รีเซ็ต Leave Balance และ Rank เรียบร้อยแล้ว");
// }

async function resetLeaveBalance() {
  console.log("🔄 กำลังรีเซ็ตข้อมูล Leave Balance");

  // 🟡 ดึง LeaveBalance เดิมก่อนลบ
  const oldLeaveBalances = await prisma.LeaveBalance.findMany();
  const remainingMap = {};
  for (const lb of oldLeaveBalances) {
    const key = `${lb.userId}-${lb.leaveTypeId}`;
    remainingMap[key] = lb.remainingDays;
  }

  // 1. ลบข้อมูล user_Rank ทั้งหมด
  await prisma.UserRank.deleteMany({});
  console.log("🧹 ลบข้อมูล user_Rank เรียบร้อย");

  // 2. ลบ LeaveBalance ทั้งหมด
  await prisma.LeaveBalance.deleteMany({});
  console.log("🧹 ลบข้อมูล leaveBalance เรียบร้อย");

  // 3. ดึงผู้ใช้งานทั้งหมดพร้อม personnelType และ hireDate
  const users = await prisma.User.findMany({
    select: {
      id: true,
      personnelTypeId: true,
      hireDate: true,
    },
  });

  console.log(`👥 พบผู้ใช้ทั้งหมด ${users.length} คน`);

  // 4. วนลูปสร้าง user_Rank และ leaveBalance ใหม่
  for (const user of users) {
    const { id, personnelTypeId, hireDate } = user;
    if (!personnelTypeId || !hireDate) continue;

    await UserService.assignRankToUser(id, personnelTypeId, new Date(hireDate));
    await UserService.assignLeaveBalanceFromRanks(id);

    // 🟡 อัปเดต remainingDays โดยใช้ของเก่ามาบวก
    const newBalances = await prisma.LeaveBalance.findMany({
      where: { userId: id },
    });

    for (const newLb of newBalances) {
      const key = `${id}-${newLb.leaveTypeId}`;
      const previousRemaining = remainingMap[key] || 0;
      let newRemaining = previousRemaining + newLb.remainingDays;

      if (newRemaining > newLb.maxDays) {
        newRemaining = newLb.maxDays;
      }

      await prisma.LeaveBalance.update({
        where: { id: newLb.id },
        data: { remainingDays: newRemaining },
      });
    }

    console.log(`✅ อัปเดต leaveBalance ของ userId ${id}`);
  }

  console.log("🎉 รีเซ็ต Leave Balance และ Rank เรียบร้อยแล้ว");
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
