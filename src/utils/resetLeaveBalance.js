const cron = require("node-cron");
const prisma = require("../config/prisma");
const UserService = require("../services/user-service");

async function resetLeaveBalance() {
  console.log("🔄 กำลังรีเซ็ตข้อมูล Leave Balance");

  const fiscalYearSetting = await prisma.setting.findUnique({
    where: { key: "fiscalYear" },
  });

  const year = fiscalYearSetting
    ? parseInt(fiscalYearSetting.value)
    : new Date().getFullYear();

  // 🟡 ดึง LeaveBalance เดิมก่อนลบ
  const oldLeaveBalances = await prisma.leaveBalance.findMany({
    where: { year },
  });
  const existingMap = new Map();
  for (const lb of oldLeaveBalances) {
    const key = `${lb.userId}-${lb.leaveTypeId}`;
    existingMap.set(key, true);
  }

  // ลบข้อมูล user_Rank ทั้งหมด
  await prisma.userRank.deleteMany({});
  console.log("🧹 ลบข้อมูล user_Rank เรียบร้อย");

  // ดึงผู้ใช้งานทั้งหมดพร้อม personnelType และ hireDate
  const users = await prisma.user.findMany({
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

    const userRanks = await prisma.userRank.findMany({
      where: { userId: id },
      include: { rank: true },
    });

    for (const ur of userRanks) {
      const { leaveTypeId, maxDays, receiveDays } = ur.rank;
      if (!leaveTypeId || maxDays === null) continue;

      const key = `${id}-${leaveTypeId}`;
      if (!existingMap.has(key)) {
        // สร้างเฉพาะที่ยังไม่มี
        await prisma.leaveBalance.create({
          data: {
            userId: id,
            leaveTypeId,
            maxDays,
            usedDays: 0,
            pendingDays: 0,
            remainingDays: receiveDays,
            year,
          },
        });
        console.log(
          `➕ เพิ่ม LeaveBalance ให้ userId ${id}, leaveType ${leaveTypeId}`
        );
      }
    }
  }

  console.log("🎉 รีเซ็ต Leave Balance และ Rank เรียบร้อยแล้ว");
}

// //             🔁 ทำงานทุกวันที่ 1 ต.ค. เวลา 00:00
// //             ┌───────────── นาที (0 - 59)
// //             │ ┌───────────── ชั่วโมง (0 - 23)
// //             │ │ ┌───────────── วันที่ของเดือน (1 - 31)
// //             │ │ │ ┌───────────── เดือน (1 - 12)
// //             │ │ │ │  ┌───────────── วันในสัปดาห์ (0 - 7) (อาทิตย์คือ 0 หรือ 7)
// //             │ │ │ │  │
// //             │ │ │ │  │
// //             * * * *  *
// cron.schedule("0 0 1 10 *", async () => {
//   console.log("🕛 เริ่มตั้งค่า Leave Balance (1 ต.ค.)");
//   await resetLeaveBalance();
// });

cron.schedule("0 0 * * *", async () => {
  // const today = new Date();
  const today = new Date("2026-01-01T00:00:00");
  // ถ้าเป็นวันที่ 1 ตุลาคม ให้รีเซ็ต Leave Balance
  if (today.getMonth() === 9 && today.getDate() === 1) {
    console.log("🕛 เริ่มตั้งค่า Leave Balance (1 ต.ค.)");

    // อัปเดตปีงบประมาณใน setting
    const fiscalYear = await prisma.setting.update({
      where: { key: "fiscalYear" },
      data: { value: String(today.getFullYear() + 1) },
    });
    console.log("ปีงบประมาณปัจจุบัน", fiscalYear.value);

    // รีเซ็ต Leave Balance
    await resetLeaveBalance();
  }
  // ถ้าเป็นวันที่ 1 มกราคม ให้รีเซ็ตปีใน setting, เพิ่มวันหยุดใหม่
  if (today.getMonth() === 0 && today.getDate() === 1) {
    const currentYearSetting = await prisma.setting.update({
      where: { key: "currentYear" },
      data: { value: today.getFullYear().toString() },
    });
    const currentYear = parseInt(currentYearSetting.value, 10);
    console.log("ปีปัจจุบัน", currentYear);

    // ดึง holiday ที่เป็น recurring
    const recurringHolidays = await prisma.holiday.findMany({
      where: { isRecurring: true },
    });

    for (const h of recurringHolidays) {
      const oldDate = new Date(h.date);
      const newDate = new Date(
        currentYear,
        oldDate.getMonth(),
        oldDate.getDate()
      );

      // เช็กว่ามี holiday นี้อยู่แล้วในปี currentYear หรือยัง
      const existing = await prisma.holiday.findFirst({
        where: {
          date: newDate,
          description: h.description,
          fiscalYear: currentYear,
        },
      });

      if (!existing) {
        await prisma.holiday.create({
          data: {
            date: newDate,
            description: h.description,
            fiscalYear: currentYear,
            isRecurring: true,
            holidayType: h.holidayType,
          },
        });

        console.log(
          `➕ เพิ่มวันหยุด ${h.description} (${newDate.toDateString()})`
        );
      } else {
        console.log(
          `⚠️ ข้าม ${h.description} (${newDate.toDateString()}) เพราะมีแล้ว`
        );
      }
    }
  }
});
