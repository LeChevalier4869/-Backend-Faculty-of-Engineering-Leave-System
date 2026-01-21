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

  // 🟡 ดึง LeaveBalance ของปีปัจจุบันเพื่อตรวจสอบว่ามีอยู่แล้วหรือไม่
  const currentLeaveBalances = await prisma.leaveBalance.findMany({
    where: { year },
  });
  const existingMap = new Map();
  for (const lb of currentLeaveBalances) {
    const key = `${lb.userId}-${lb.leaveTypeId}`;
    existingMap.set(key, true);
  }

  // 🛡️ ตรวจสอบว่ามีข้อมูลปีก่อนหรือไม่
  if (currentLeaveBalances.length === 0) {
    console.log("⚠️ ไม่พบข้อมูล LeaveBalance ปีก่อน จะข้ามการ reset");
    return;
  }

  // 🧹 ลบข้อมูล LeaveBalance ของปีปัจจุบันก่อน (เพื่อป้องกันการสร้างซ้ำ)
  await prisma.leaveBalance.deleteMany({
    where: { year }
  });
  console.log("🧹 ลบข้อมูล LeaveBalance ปีปัจจุบันเรียบร้อย");

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

  
  // 4. วนลูปสร้าง user_Rank และ leaveBalance ใหม่ (แก้ตรงนี้ ยังไม่เสร็จ)
  for (const user of users) {
    const { id, personnelTypeId, hireDate } = user;
    if (!personnelTypeId || !hireDate) continue;
    
    await UserService.assignRankToUser(id, personnelTypeId, new Date(hireDate));
    
    // ดึง balance เก่ามาทบ เฉพาะของ ลาพักผ่อน (leaveType === 4) ที่ยังรีเซ็ตปีใหม่อยู่
    const leaveType4 = await prisma.leaveType.findUnique({
      where: { id: 4 },
      select: { resetOnFiscalYear: true }
    });
    
    let carryOverDays = 0;
    if (leaveType4?.resetOnFiscalYear) {
      // ดึง balance ปีก่อนเฉพาะประเภทลาพักผ่อน
      const balanceVacation = await prisma.leaveBalance.findFirst({
        where: { userId: id, leaveTypeId: 4, year: year - 1 },
        select: { remainingDays: true, maxDays: true, usedDays: true }
      });
      
      // 🛡️ ตรวจสอบความถูกต้องของ balance ปีก่อน
      if (balanceVacation) {
        const remainingDays = Math.max(0, balanceVacation.remainingDays || 0);
        const maxDays = balanceVacation.maxDays || 0;
        const usedDays = balanceVacation.usedDays || 0;
        
        // 🎯 ใช้ค่าที่ถูกต้อง: remainingDays ไม่เกิน maxDays - usedDays
        carryOverDays = Math.min(remainingDays, maxDays - usedDays);
        
        console.log(`💰 คำนวณ carry over สำหรับ userId ${id}: สิทธิ์ ${remainingDays}/${maxDays}, ใช้ไป ${usedDays}, carry over ${carryOverDays}`);
      } else {
        console.log(`⚠️ ไม่พบ balance ปีก่อนสำหรับ userId ${id}, leaveType 4`);
        carryOverDays = 0;
      }
    }
    
    const userRanks = await prisma.userRank.findMany({
      where: { userId: id },
      include: { rank: true },
    });

    for (const ur of userRanks) {
      const { leaveTypeId, maxDays, receiveDays, isBalance } = ur.rank;
      if (!leaveTypeId || maxDays === null) continue;

      // ตรวจสอบว่า leaveType นี้ต้องรีเซ็ตปีใหม่หรือไม่ และเป็นประเภทที่ไม่ต้องหักวันหรือไม่
      const leaveType = await prisma.leaveType.findUnique({
        where: { id: leaveTypeId },
        select: { 
          resetOnFiscalYear: true,
          isNonDeductible: true
        }
      });

      // สำหรับประเภทที่ต้องหักวัน
      const daysToUse = receiveDays > 0 ? receiveDays : maxDays;
      
      let newRemainingDays;
      let balanceData;
      
      if (leaveType?.isNonDeductible) {
        // ประเภทที่ไม่ต้องหักวัน: สร้าง balance สำหรับเก็บสถิติเท่านั้น
        balanceData = {
          userId: id,
          leaveTypeId,
          maxDays: 0,
          usedDays: 0,
          pendingDays: 0,
          remainingDays: 0,
          year,
        };
      } else if (Number(leaveTypeId) === 4) {
        // ลาพักผ่อน: จัดการเสมอ
        if (leaveType?.resetOnFiscalYear) {
          // ถ้ารีเซ็ตปีใหม่ ให้ทำ carry over
          const balanceVacation = await prisma.leaveBalance.findFirst({
            where: { userId: id, leaveTypeId: 4, year: year - 1 },
            select: { remainingDays: true },
          });
          const carryOverDays = balanceVacation?.remainingDays ?? 0;
          newRemainingDays = daysToUse + carryOverDays;
          console.log(`💰 ลาพักผ่อน userId ${id}: ใหม่ ${daysToUse} + carryOver ${carryOverDays} = ${newRemainingDays}`);
        } else {
          // ถ้าไม่รีเซ็ตปีใหม่ ให้เพิ่มวันใหม่เข้าไปใน balance เดิม
          const currentBalance = await prisma.leaveBalance.findFirst({
            where: { userId: id, leaveTypeId: 4, year },
            select: { remainingDays: true, maxDays: true }
          });
          const currentRemaining = currentBalance?.remainingDays ?? 0;
          const currentMaxDays = currentBalance?.maxDays ?? maxDays;
          newRemainingDays = currentRemaining + daysToUse;
          console.log(`💰 ลาพักผ่อน userId ${id}: เดิม ${currentRemaining} + ใหม่ ${daysToUse} = ${newRemainingDays}`);
          
          balanceData = {
            userId: id,
            leaveTypeId,
            maxDays: currentMaxDays + daysToUse, // เพิ่ม maxDays ตามวันที่ได้รับ
            usedDays: 0,
            pendingDays: 0,
            remainingDays: newRemainingDays,
            year,
          };
        }
      } else if (leaveType?.resetOnFiscalYear) {
        // ประเภทอื่นๆ ที่รีเซ็ตปีใหม่: ใช้ logic เดิม
        newRemainingDays = daysToUse + carryOverDays;
        
        balanceData = {
          userId: id,
          leaveTypeId,
          maxDays,
          usedDays: 0,
          pendingDays: 0,
          remainingDays: newRemainingDays >= maxDays ? maxDays : newRemainingDays,
          year,
        };
      } else {
        // ประเภทที่ไม่รีเซ็ตปีใหม่และไม่ใช่พิเศษ: ข้าม
        console.log(`⏭️ ข้าม LeaveType ${leaveTypeId} (ไม่รีเซ็ตปีใหม่)`);
        continue;
      }

      const key = `${id}-${leaveTypeId}`;
      if (existingMap.has(key)) {
        // ถ้ามีอยู่แล้ว ให้อัปเดต
        await prisma.leaveBalance.update({
          where: {
            userId_leaveTypeId_year: {
              userId: id,
              leaveTypeId,
              year
            }
          },
          data: balanceData,
        });
        console.log(
          `🔄 อัปเดต LeaveBalance ให้ userId ${id}, leaveType ${leaveTypeId}`
        );
      } else {
        // สร้างเฉพาะที่ยังไม่มี
        await prisma.leaveBalance.create({
          data: balanceData,
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

cron.schedule("0 0 1 10 *", async () => {
  const today = new Date();
  // const today = new Date("2025-10-01");
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
      where: { isRecurring: true, fiscalYear: currentYear - 1 },
    });
    console.log(recurringHolidays);

    for (const h of recurringHolidays) {
      const oldDate = new Date(h.date);
      console.log(oldDate);

      // ✅ Normalize เป็น local midnight
      const newDate = new Date(
        currentYear,
        oldDate.getMonth(), // เดือนเดิม
        oldDate.getDate(), // วันเดิม
        oldDate.getHours(), // ชั่วโมงเดิม
        oldDate.getMinutes(), // นาทีเดิม
        oldDate.getSeconds(), // วินาทีเดิม
        oldDate.getMilliseconds() // มิลลิวินาทีเดิม
      );

      console.log(newDate.toISOString());

      // ✅ ช่วงเวลาเริ่ม-จบของวัน (local time)
      const startOfDay = new Date(newDate);
      const endOfDay = new Date(newDate);
      endOfDay.setDate(endOfDay.getDate() + 1);

      // ✅ เช็กว่ามี holiday นี้อยู่แล้วในปี currentYear หรือยัง
      const existing = await prisma.holiday.findFirst({
        where: {
          description: h.description,
          fiscalYear: currentYear,
          date: {
            gte: startOfDay,
            lt: endOfDay,
          },
        },
      });

      if (!existing) {
        await prisma.holiday.create({
          data: {
            date: newDate, // ⬅️ local midnight
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
