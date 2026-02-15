const cron = require("node-cron");
const prisma = require("../config/prisma");
const AuditLogService = require("../services/auditLog-service");

async function resetLeaveBalance() {
  console.log("🔄 กำลังรีเซ็ตข้อมูล Leave Balance");

  try {
    // Log การเริ่ม process
    await AuditLogService.createLog(
      null, // system process ไม่มี userId
      'FISCAL_YEAR_RESET_START', 
      'SYSTEM', 
      null,
      `เริ่มรีเซ็ต Leave Balance ปีงบประมาณใหม่`,
      null, 
      'SYSTEM_CRON'
    );

    const fiscalYearSetting = await prisma.setting.findUnique({
      where: { key: "fiscalYear" },
    });

    const year = fiscalYearSetting
      ? parseInt(fiscalYearSetting.value)
      : new Date().getFullYear();

    console.log(`📅 กำลังรีเซ็ตสำหรับปีงบประมาณ: ${year}`);

  // 🟡 ตรวจสอบว่ามีข้อมูลปีปัจจุบันอยู่แล้วหรือไม่
  const currentLeaveBalances = await prisma.leaveBalance.findMany({
    where: { year },
  });
  
  if (currentLeaveBalances.length > 0) {
    console.log(`⚠️ พบข้อมูล LeaveBalance ปี ${year} แล้ว ${currentLeaveBalances.length} รายการ`);
    console.log("� จะทำการอัปเดตข้อมูลเดิมแทนการสร้างใหม่");
  } else {
    console.log(`✅ ไม่พบข้อมูล LeaveBalance ปี ${year} จะสร้างข้อมูลใหม่`);
  }

  // 🛡️ ไม่ลบข้อมูลปีก่อน - เก็บไว้เป็นประวัติ
  console.log("📚 คงข้อมูลปีก่อนไว้เพื่อประวัติและการอ้างอิง");

  // ดึงผู้ใช้งานทั้งหมดพร้อม personnelType และ hireDate
  const users = await prisma.user.findMany({
    select: {
      id: true,
      personnelTypeId: true,
      hireDate: true,
    },
  });
  console.log(`👥 พบผู้ใช้ทั้งหมด ${users.length} คน`);

  // 4. ใช้ transaction สำหรับการรีเซ็ตข้อมูลทั้งหมด
  await prisma.$transaction(async (tx) => {
    // 4.1 ดึงข้อมูลที่จำเป็นทั้งหมดมาก่อน (เพื่อลดการ query ซ้ำ)
    const allLeaveTypes = await tx.leaveType.findMany({
      select: { 
        id: true,
        resetOnFiscalYear: true,
        isNonDeductible: true
      }
    });
    
    const allRanks = await tx.rank.findMany();
    
    // สร้าง map สำหรับค้นหาเร็วๆ
    const leaveTypeMap = new Map();
    allLeaveTypes.forEach(lt => {
      leaveTypeMap.set(lt.id, lt);
    });
    
    // 4.2 ลบข้อมูลเก่า
    console.log("🧹 ลบข้อมูล user_Rank เรียบร้อย (เพื่อสร้างใหม่ตามอาวุโส)");
    await tx.userRank.deleteMany({});
    
    console.log("🧹 ลบข้อมูล LeaveBalance ปีเก่าเรียบร้อย");
    await tx.leaveBalance.deleteMany({
      where: { year }
    });
    
    // 4.3 สร้าง userRanks ทั้งหมดในครั้งเดียว
    const userRankData = [];
    for (const user of users) {
      const { id, personnelTypeId, hireDate } = user;
      if (!personnelTypeId || !hireDate) continue;
      
      const currentDate = new Date();
      const hireDateObj = new Date(hireDate); // แปลงเป็น Date object
      const hireMonths =
        (currentDate.getFullYear() - hireDateObj.getFullYear()) * 12 +
        (currentDate.getMonth() - hireDateObj.getMonth());

      // กรอง ranks ตาม personnelTypeId
      const filteredRanks = allRanks.filter(rank => 
        rank.personnelTypeId === parseInt(personnelTypeId)
      );

      for (const rank of filteredRanks) {
        const { id: rankId, minHireMonths, maxHireMonths, leaveTypeId } = rank;
        
        // ตรวจสอบเงื่อนไข
        const minPass = minHireMonths === null || hireMonths >= minHireMonths;
        const maxPass = maxHireMonths === null || hireMonths <= maxHireMonths;
        
        if (minPass && maxPass && leaveTypeId !== null) {
          userRankData.push({
            userId: id,
            rankId,
          });
        }
      }
    }
    
    // สร้าง userRanks ทั้งหมดในครั้งเดียว
    if (userRankData.length > 0) {
      console.log(`📝 สร้าง userRank ${userRankData.length} รายการ`);
      await tx.userRank.createMany({
        data: userRankData,
        skipDuplicates: true
      });
    }
    
    // 4.4 วนลูปสร้างข้อมูล LeaveBalance
    for (const user of users) {
    const { id, personnelTypeId, hireDate } = user;
    if (!personnelTypeId || !hireDate) continue;
    
    // ดึง balance เก่ามาทบ เฉพาะของ ลาพักผ่อน (leaveType === 4) ที่ยังรีเซ็ตปีใหม่อยู่
    const leaveType4 = leaveTypeMap.get(4);
    
    let carryOverDays = 0;
    if (leaveType4?.resetOnFiscalYear) {
      // ดึง balance ปีก่อนเฉพาะประเภทลาพักผ่อน
      const balanceVacation = await tx.leaveBalance.findFirst({
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
    
    const userRanks = await tx.userRank.findMany({
      where: { userId: id },
      include: { rank: true },
    });

    for (const ur of userRanks) {
      const { leaveTypeId, maxDays, receiveDays, isBalance } = ur.rank;
      if (!leaveTypeId || maxDays === null) continue;

      // ตรวจสอบว่า leaveType นี้ต้องรีเซ็ตปีใหม่หรือไม่ และเป็นประเภทที่ไม่ต้องหักวันหรือไม่
      const leaveType = leaveTypeMap.get(leaveTypeId);

      // ถ้าไม่รีเซ็ตปีใหม่และไม่ใช่ลาพักผ่อน ให้ข้าม (ยกเว้นประเภทที่ไม่ต้องหักวันที่มี isBalance: true)
      if (!leaveType?.resetOnFiscalYear && 
          Number(leaveTypeId) !== 4 && 
          !leaveType?.isNonDeductible) {
        console.log(`⏭️ ข้าม LeaveType ${leaveTypeId} (ไม่รีเซ็ตปีใหม่)`);
        continue;
      }

      // ถ้าเป็นประเภทที่ไม่ต้องหักวัน แต่ไม่รีเซ็ตปีใหม่และ isBalance เป็น false ให้ข้าม
      if (leaveType?.isNonDeductible && !leaveType?.resetOnFiscalYear && !isBalance) {
        console.log(`⏭️ ข้าม LeaveType ${leaveTypeId} (ไม่ต้องหักวัน ไม่รีเซ็ตปีใหม่ และไม่ต้องสร้าง balance)`);
        continue;
      }

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
          // ถ้ารีเซ็ตปีใหม่ ให้ทำ carry over (ใช้ค่าที่คำนวณไว้แล้วข้างต้น)
          newRemainingDays = daysToUse + carryOverDays;
          console.log(`💰 ลาพักผ่อน userId ${id}: ใหม่ ${daysToUse} + carryOver ${carryOverDays} = ${newRemainingDays}`);
          
          balanceData = {
            userId: id,
            leaveTypeId,
            maxDays: daysToUse,
            usedDays: 0,
            pendingDays: 0,
            remainingDays: newRemainingDays,
            year,
          };
        } else {
          // ถ้าไม่รีเซ็ตปีใหม่ ให้เพิ่มวันใหม่เข้าไปใน balance เดิม
          const currentBalance = await tx.leaveBalance.findFirst({
            where: { userId: id, leaveTypeId: 4, year },
            select: { remainingDays: true, maxDays: true }
          });
          const currentRemaining = currentBalance?.remainingDays ?? 0;
          const currentMaxDays = currentBalance?.maxDays ?? 0; // Default to 0 when no existing balance
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
      }

      // ถ้าถึงตรงนี้แล้ว balanceData ต้องมีค่าแน่นอน
      if (!balanceData) {
        console.log(`⚠️ ไม่สามารถสร้าง balanceData สำหรับ userId ${id}, leaveType ${leaveTypeId}`);
        continue;
      }

      // 🔍 ตรวจสอบว่ามีข้อมูลอยู่แล้วหรือไม่
      const existingBalance = await tx.leaveBalance.findFirst({
        where: {
          userId: id,
          leaveTypeId,
          year,
        },
      });

      if (existingBalance) {
        // อัปเดตข้อมูลเดิม
        await tx.leaveBalance.update({
          where: { id: existingBalance.id },
          data: balanceData,
        });
        console.log(
          `🔄 อัปเดต LeaveBalance สำหรับ userId ${id}, leaveTypeId ${leaveTypeId}`
        );
      } else {
        // สร้างข้อมูลใหม่
        await tx.leaveBalance.create({
          data: balanceData,
        });
        console.log(
          `➕ สร้าง LeaveBalance ใหม่สำหรับ userId ${id}, leaveTypeId ${leaveTypeId}`
        );
      }  
    }
    } // ปิด transaction
  }, { timeout: 60000 }); // เพิ่ม timeout เป็น 60 วินาที

  console.log("🎉 รีเซ็ต Leave Balance และ Rank เรียบร้อยแล้ว");

  // Log การสำเร็จ
  await AuditLogService.createLog(
    null,
    'FISCAL_YEAR_RESET_SUCCESS', 
    'SYSTEM', 
    null,
    `รีเซ็ต Leave Balance สำเร็จสำหรับปีงบประมาณ ${year}`,
    null, 
    'SYSTEM_CRON'
  );

  } catch (error) {
    console.error("❌ เกิดข้อผิดพลาดในการรีเซ็ต Leave Balance:", error);
    
    // Log error
    await AuditLogService.createLog(
      null,
      'FISCAL_YEAR_RESET_ERROR', 
      'SYSTEM', 
      null,
      `รีเซ็ต Leave Balance ผิดพลาด: ${error.message}`,
      null, 
      'SYSTEM_CRON'
    );
    
    throw error; // โยน error ต่อเพื่อให้ CRON รับรู้
  }
}

async function resetDocumentNumber(fiscalYear) {
  try {
    // แปลงปี คศ เป็น พศ (คศ + 543)
    const buddhistYear = fiscalYear + 543;
    const yearSuffix = String(buddhistYear).slice(-2); // 2569 → "69"
    const resetValue = `คว.0001/${yearSuffix}`;
    
    // ตรวจสอบค่าปัจจุบันก่อน
    const currentSetting = await prisma.setting.findUnique({
      where: { key: 'runNumber' }
    });
    
    if (!currentSetting) {
      throw new Error('ไม่พบ setting: runNumber');
    }
    
    // Log ก่อนเปลี่ยนแปลง
    await AuditLogService.createLog(
      null,
      'DOCUMENT_NUMBER_RESET_START', 
      'SYSTEM', 
      null,
      `เริ่มรีเซ็ต Document Number: ${currentSetting.value} → ${resetValue}`,
      null, 
      'SYSTEM_CRON',
      { 
        oldValue: currentSetting.value,
        newValue: resetValue,
        fiscalYear: fiscalYear,
        buddhistYear: buddhistYear
      }
    );
    
    // อัปเดตค่า
    await prisma.setting.update({
      where: { key: 'runNumber' },
      data: { value: resetValue }
    });
    
    console.log(`📄 [CRON] รีเซ็ต Document Number เป็น: ${resetValue} (ปี คศ:${fiscalYear} → พศ:${buddhistYear})`);
    
    // Log สำเร็จ
    await AuditLogService.createLog(
      null,
      'DOCUMENT_NUMBER_RESET_SUCCESS', 
      'SYSTEM', 
      null,
      `รีเซ็ต Document Number สำเร็จ: ${resetValue}`,
      null, 
      'SYSTEM_CRON',
      { 
        oldValue: currentSetting.value,
        newValue: resetValue,
        fiscalYear: fiscalYear,
        buddhistYear: buddhistYear
      }
    );
    
    return resetValue;
    
  } catch (error) {
    console.error("❌ เกิดข้อผิดพลาดในการรีเซ็ต Document Number:", error);
    
    // Log error
    await AuditLogService.createLog(
      null,
      'DOCUMENT_NUMBER_RESET_ERROR', 
      'SYSTEM', 
      null,
      `รีเซ็ต Document Number ผิดพลาด: ${error.message}`,
      null, 
      'SYSTEM_CRON',
      { 
        error: error.message,
        fiscalYear: fiscalYear
      }
    );
    
    throw error;
  }
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
// cron.schedule("0 0 0 0 *", async () => {
//   console.log("🕛 เริ่มตั้งค่า Leave Balance (1 ต.ค.)");
//   await resetLeaveBalance();
// });

// แสดงข้อมูล CRON job เมื่อ server เริ่มทำงาน
console.log("🕐 [CRON] ตั้งค่า cron job สำหรับการจัดการ Leave Balance:");
console.log("   - รีเซ็ต Leave Balance: 00:00 ทุกวันที่ 1 ต.ค. (Asia/Bangkok)");
console.log("   - อัปเดตปีงบประมาณและวันหยุด: 00:00 ทุกวันที่ 1 ต.ค. (Asia/Bangkok)");
console.log("   - รีเซ็ต Document Number: 00:00 ทุกวันที่ 1 ต.ค. (Asia/Bangkok)");

cron.schedule("0 0 1 10 *", async () => {
  // Set timezone to Bangkok (UTC+7)
  process.env.TZ = 'Asia/Bangkok';
  
  const today = new Date();
  // const today = new Date("2025-10-01");
  // ถ้าเป็นวันที่ 1 ตุลาคม ให้รีเซ็ต Leave Balance
  if (today.getMonth() === 9 && today.getDate() === 1) {
    console.log("🕛 [CRON] เริ่มตั้งค่า Leave Balance (1 ต.ค.)");

    // อัปเดตปีงบประมาณใน setting
    const fiscalYear = today.getFullYear() + 1;
    const fiscalYearSetting = await prisma.setting.update({
      where: { key: "fiscalYear" },
      data: { value: String(fiscalYear) },
    });
    console.log("📅 [CRON] อัปเดตปีงบประมาณเป็น:", fiscalYearSetting.value);

    // 🆕 RESET DOCUMENT NUMBER
    await resetDocumentNumber(fiscalYear);

    // รีเซ็ต Leave Balance
    await resetLeaveBalance();
    console.log("✅ [CRON] รีเซ็ต Leave Balance สำเร็จ");
  }
  // ถ้าเป็นวันที่ 1 มกราคม ให้รีเซ็ตปีใน setting, เพิ่มวันหยุดใหม่
  if (today.getMonth() === 0 && today.getDate() === 1) {
    console.log("🎆 [CRON] เริ่มตั้งค่าปีใหม่ (1 ม.ค.)");
    
    try {
      // Log การเริ่มต้นปีใหม่
      await AuditLogService.createLog(
        null,
        'NEW_YEAR_SETUP_START', 
        'SYSTEM', 
        null,
        `เริ่มตั้งค่าปีปฏิทินใหม่: ${today.getFullYear()}`,
        null, 
        'SYSTEM_CRON'
      );
      
      const currentYearSetting = await prisma.setting.update({
        where: { key: "currentYear" },
        data: { value: today.getFullYear().toString() },
      });
      const currentYear = parseInt(currentYearSetting.value, 10);
      console.log("📅 [CRON] อัปเดตปีปัจจุบันเป็น:", currentYear);

    // ดึง holiday ที่เป็น recurring
    const recurringHolidays = await prisma.holiday.findMany({
      where: { isRecurring: true, fiscalYear: currentYear - 1 },
    });
    console.log(`🔍 [CRON] พบวันหยุด recurring ที่ต้องอัปเดต: ${recurringHolidays.length} รายการ`);

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
          `➕ [CRON] เพิ่มวันหยุด ${h.description} (${newDate.toDateString()})`
        );
      } else {
        console.log(
          `⚠️ [CRON] ข้าม ${h.description} (${newDate.toDateString()}) เพราะมีแล้ว`
        );
      }
    }
    console.log("✅ [CRON] อัปเดตวันหยุดปีใหม่สำเร็จ");
    
    // Log การสำเร็จปีใหม่
    await AuditLogService.createLog(
      null,
      'NEW_YEAR_SETUP_SUCCESS', 
      'SYSTEM', 
      null,
      `ตั้งค่าปีปฏิทินใหม่ ${currentYear} สำเร็จ: ${recurringHolidays.length} วันหยุด`,
      null, 
      'SYSTEM_CRON',
      { 
        currentYear: currentYear,
        holidaysProcessed: recurringHolidays.length
      }
    );
    
    } catch (error) {
      console.error("❌ เกิดข้อผิดพลาดในการตั้งค่าปีใหม่:", error);
      
      // Log error
      await AuditLogService.createLog(
        null,
        'NEW_YEAR_SETUP_ERROR', 
        'SYSTEM', 
        null,
        `ตั้งค่าปีใหม่ผิดพลาด: ${error.message}`,
        null, 
        'SYSTEM_CRON',
        { 
          error: error.message,
          year: today.getFullYear()
        }
      );
    }
  }
  console.log("🕐 [CRON] ตรวจสอบ cron job วันนี้เรียบร้อยแล้ว");
});

module.exports = {
  resetLeaveBalance,
  resetDocumentNumber
};
