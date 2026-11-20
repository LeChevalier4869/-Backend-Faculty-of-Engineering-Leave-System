const cron = require("node-cron");
const prisma = require("../config/prisma");
const AuditLogService = require("../services/auditLog-service");
const FISCAL_YEAR_TIME_ZONE = "Asia/Bangkok";
const LAST_LEAVE_BALANCE_RESET_KEY = "lastLeaveBalanceResetYear";
let lastExistingBalancesWarningYear = null;

function logFiscalYearEvent(level, event, details = {}) {
  const log = console[level] || console.log;
  log(
    JSON.stringify({
      timestamp: new Date().toISOString(),
      service: "fiscal-year-cron",
      event,
      ...details,
    }),
  );
}

function getFiscalYearForDate(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: FISCAL_YEAR_TIME_ZONE,
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).formatToParts(date);
  const year = Number(parts.find((part) => part.type === "year")?.value);
  const month = Number(parts.find((part) => part.type === "month")?.value);

  if (!Number.isInteger(year) || !Number.isInteger(month)) {
    throw new Error("ไม่สามารถคำนวณปีงบประมาณตามเวลา Asia/Bangkok ได้");
  }

  return month >= 10 ? year + 1 : year;
}

async function resetLeaveBalance(targetYear, options = {}) {
  console.log("🔄 กำลังรีเซ็ตข้อมูล Leave Balance");
  let year = Number.parseInt(targetYear, 10);
  const startedAt = Date.now();
  const copyBalancesConfig = options.copyBalancesFromYearForUsers;

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

    if (!Number.isInteger(year)) {
      const fiscalYearSetting = await prisma.setting.findUnique({
        where: { key: "fiscalYear" },
      });
      year = fiscalYearSetting
        ? Number.parseInt(fiscalYearSetting.value, 10)
        : new Date().getFullYear();
    }
    if (!Number.isInteger(year)) {
      throw new Error("ไม่พบปีงบประมาณที่ถูกต้องสำหรับรีเซ็ต Leave Balance");
    }
    const rawCopyUserIds = copyBalancesConfig?.userIds;
    const copyUserIds = Array.isArray(rawCopyUserIds)
      ? [...new Set(rawCopyUserIds)]
      : [];
    const copyFromYear = Number.parseInt(copyBalancesConfig?.year, 10);
    if (
      copyBalancesConfig &&
      (!Number.isInteger(copyFromYear) ||
        copyFromYear === year ||
        !Array.isArray(copyUserIds) ||
      copyUserIds.length === 0 ||
        copyUserIds.some((userId) => !Number.isInteger(userId)))
    ) {
      throw new Error("ข้อมูลปีต้นทางหรือรายชื่อผู้ใช้สำหรับคัดลอก Leave Balance ไม่ถูกต้อง");
    }

    logFiscalYearEvent("info", "leave_balance_reset_started", { year });
    console.log(`📅 กำลังรีเซ็ตสำหรับปีงบประมาณ: ${year}`);

  // 🟡 ตรวจสอบว่ามีข้อมูลปีปัจจุบันอยู่แล้วหรือไม่
  const currentLeaveBalanceCount = await prisma.leaveBalance.count({
    where: { year },
  });
  
  if (currentLeaveBalanceCount > 0) {
    console.log(`⚠️ พบข้อมูล LeaveBalance ปี ${year} แล้ว ${currentLeaveBalanceCount} รายการ`);
    console.log("♻️ จะรีเซ็ตเฉพาะประเภทที่กำหนดให้รีเซ็ต และคงยอดประเภทถาวรไว้");
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

  await prisma.$transaction(
    async (tx) => {
      const [allLeaveTypes, allRanks] = await Promise.all([
        tx.leaveType.findMany({
          select: {
            id: true,
            resetOnFiscalYear: true,
            isNonDeductible: true,
          },
        }),
        tx.rank.findMany(),
      ]);
      const leaveTypeMap = new Map(
        allLeaveTypes.map((leaveType) => [leaveType.id, leaveType]),
      );
      const resettableLeaveTypeIds = allLeaveTypes
        .filter((leaveType) => leaveType.resetOnFiscalYear)
        .map((leaveType) => leaveType.id);
      const nonResetLeaveTypeIds = allLeaveTypes
        .filter((leaveType) => !leaveType.resetOnFiscalYear)
        .map((leaveType) => leaveType.id);
      const existingNonResetBalances =
        nonResetLeaveTypeIds.length > 0
          ? await tx.leaveBalance.findMany({
              where: { year, leaveTypeId: { in: nonResetLeaveTypeIds } },
              select: { userId: true, leaveTypeId: true },
            })
          : [];
      const existingNonResetBalanceKeys = new Set(
        existingNonResetBalances.map(
          (balance) => `${balance.userId}:${balance.leaveTypeId}`,
        ),
      );
      const copiedBalances =
        copyUserIds.length > 0
          ? await tx.leaveBalance.findMany({
              where: {
                year: copyFromYear,
                userId: { in: copyUserIds },
              },
              select: {
                userId: true,
                leaveTypeId: true,
                maxDays: true,
                usedDays: true,
                pendingDays: true,
                remainingDays: true,
              },
            })
          : [];
      const copiedUserIds = new Set(
        copiedBalances.map((balance) => balance.userId),
      );
      const missingCopyUsers = copyUserIds.filter(
        (userId) => !copiedUserIds.has(userId),
      );
      if (missingCopyUsers.length > 0) {
        throw new Error(
          `ไม่พบ Leave Balance ปี ${copyFromYear} สำหรับ userId: ${missingCopyUsers.join(", ")}`,
        );
      }

      await tx.userRank.deleteMany({});
      if (copyUserIds.length > 0) {
        await tx.leaveBalance.deleteMany({
          where: { year, userId: { in: copyUserIds } },
        });
      }
      if (resettableLeaveTypeIds.length > 0) {
        await tx.leaveBalance.deleteMany({
          where: { year, leaveTypeId: { in: resettableLeaveTypeIds } },
        });
      }

      const userRankData = [];
      const userRanksByUser = new Map();
      const currentDate = new Date();

      for (const user of users) {
        const { id, personnelTypeId, hireDate } = user;
        if (!personnelTypeId || !hireDate) continue;

        const hireDateObj = new Date(hireDate);
        const hireMonths =
          (currentDate.getFullYear() - hireDateObj.getFullYear()) * 12 +
          (currentDate.getMonth() - hireDateObj.getMonth());
        const eligibleRanks = allRanks.filter((rank) => {
          if (rank.personnelTypeId !== Number.parseInt(personnelTypeId, 10)) {
            return false;
          }
          const minPass =
            rank.minHireMonths === null || hireMonths >= rank.minHireMonths;
          const maxPass =
            rank.maxHireMonths === null || hireMonths <= rank.maxHireMonths;
          return minPass && maxPass && rank.leaveTypeId !== null;
        });

        userRanksByUser.set(id, eligibleRanks);
        userRankData.push(
          ...eligibleRanks.map((rank) => ({ userId: id, rankId: rank.id })),
        );
      }

      if (userRankData.length > 0) {
        await tx.userRank.createMany({
          data: userRankData,
          skipDuplicates: true,
        });
      }

      const balancesByUserAndType = new Map();
      for (const user of users) {
        const { id, personnelTypeId, hireDate } = user;
        if (!personnelTypeId || !hireDate) continue;
        if (copyUserIds.includes(id)) continue;

        const leaveType4 = leaveTypeMap.get(4);
        let carryOverDays = 0;
        if (leaveType4?.resetOnFiscalYear) {
          const balanceVacation = await tx.leaveBalance.findFirst({
            where: { userId: id, leaveTypeId: 4, year: year - 1 },
            select: { remainingDays: true, maxDays: true, usedDays: true },
          });

          if (balanceVacation) {
            const remainingDays = Math.max(0, balanceVacation.remainingDays || 0);
            const maxDays = balanceVacation.maxDays || 0;
            const usedDays = balanceVacation.usedDays || 0;
            carryOverDays = Math.min(remainingDays, maxDays - usedDays);
          }
        }

        for (const rank of userRanksByUser.get(id) || []) {
          const { leaveTypeId, maxDays, receiveDays } = rank;
          if (!leaveTypeId || maxDays === null) continue;

          const leaveType = leaveTypeMap.get(leaveTypeId);
          const balanceKey = `${id}:${leaveTypeId}`;
          if (
            !leaveType?.resetOnFiscalYear &&
            existingNonResetBalanceKeys.has(balanceKey)
          ) {
            continue;
          }
          if (
            !leaveType?.resetOnFiscalYear &&
            Number(leaveTypeId) !== 4 &&
            !leaveType?.isNonDeductible
          ) {
            console.log(`⏭️ ข้าม LeaveType ${leaveTypeId} (ไม่รีเซ็ตปีใหม่)`);
            continue;
          }

          const daysToUse = receiveDays > 0 ? receiveDays : maxDays;
          let balanceData;

          if (leaveType?.isNonDeductible) {
            if (!leaveType.resetOnFiscalYear) {
              const prev = await tx.leaveBalance.findFirst({
                where: { userId: id, leaveTypeId, year: { lt: year } },
                orderBy: { year: "desc" },
              });
              balanceData = {
                userId: id,
                leaveTypeId,
                maxDays: prev?.maxDays ?? 0,
                usedDays: prev?.usedDays ?? 0,
                pendingDays: prev?.pendingDays ?? 0,
                remainingDays: prev?.remainingDays ?? 0,
                year,
              };
            } else {
              balanceData = {
                userId: id,
                leaveTypeId,
                maxDays: 0,
                usedDays: 0,
                pendingDays: 0,
                remainingDays: 0,
                year,
              };
            }
          } else if (Number(leaveTypeId) === 4) {
            if (leaveType?.resetOnFiscalYear) {
              balanceData = {
                userId: id,
                leaveTypeId,
                maxDays: daysToUse,
                usedDays: 0,
                pendingDays: 0,
                remainingDays: daysToUse + carryOverDays,
                year,
              };
            } else {
              const currentBalance = await tx.leaveBalance.findFirst({
                where: { userId: id, leaveTypeId: 4, year },
                select: { remainingDays: true, maxDays: true },
              });
              const currentRemaining = currentBalance?.remainingDays ?? 0;
              const currentMaxDays = currentBalance?.maxDays ?? 0;
              balanceData = {
                userId: id,
                leaveTypeId,
                maxDays: currentMaxDays + daysToUse,
                usedDays: 0,
                pendingDays: 0,
                remainingDays: currentRemaining + daysToUse,
                year,
              };
            }
          } else if (leaveType?.resetOnFiscalYear) {
            const newRemainingDays = daysToUse + carryOverDays;
            balanceData = {
              userId: id,
              leaveTypeId,
              maxDays,
              usedDays: 0,
              pendingDays: 0,
              remainingDays:
                newRemainingDays >= maxDays ? maxDays : newRemainingDays,
              year,
            };
          }

          if (balanceData) {
            balancesByUserAndType.set(balanceKey, balanceData);
          }
        }
      }

      const balanceData = [
        ...balancesByUserAndType.values(),
        ...copiedBalances.map((balance) => ({
          ...balance,
          year,
        })),
      ];
      if (balanceData.length > 0) {
        await tx.leaveBalance.createMany({ data: balanceData });
      }
      logFiscalYearEvent("info", "leave_balance_reset_records_prepared", {
        year,
        userRankCount: userRankData.length,
        leaveBalanceCount: balanceData.length,
        copiedBalanceCount: copiedBalances.length,
      });

      if (options.updateFiscalYear) {
        await tx.setting.update({
          where: { key: "fiscalYear" },
          data: { value: String(year) },
        });
      }
      if (options.markAutomaticReset) {
        await tx.setting.upsert({
          where: { key: LAST_LEAVE_BALANCE_RESET_KEY },
          update: { value: String(year) },
          create: {
            key: LAST_LEAVE_BALANCE_RESET_KEY,
            type: "number",
            value: String(year),
            description: "ปีงบประมาณล่าสุดที่ cron สร้างยอด Leave Balance สำเร็จ",
          },
        });
      }
    },
    { timeout: 60000 },
  );

  console.log("🎉 รีเซ็ต Leave Balance และ Rank เรียบร้อยแล้ว");
  logFiscalYearEvent("info", "leave_balance_reset_succeeded", {
    year,
    durationMs: Date.now() - startedAt,
  });

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
    logFiscalYearEvent("error", "leave_balance_reset_failed", {
      year: Number.isInteger(year) ? year : null,
      error: error.message,
      errorName: error.name,
      errorCode: error.code || null,
      durationMs: Date.now() - startedAt,
    });
    
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

async function ensureCurrentFiscalYearBalances(date = new Date()) {
  const year = getFiscalYearForDate(date);
  const fiscalYearSetting = await prisma.setting.findUnique({
    where: { key: "fiscalYear" },
  });
  const resetYearSetting = await prisma.setting.findUnique({
    where: { key: LAST_LEAVE_BALANCE_RESET_KEY },
  });
  const configuredYear = Number.parseInt(fiscalYearSetting?.value, 10);
  const completedYear = Number.parseInt(resetYearSetting?.value, 10);

  if (Number.isInteger(completedYear) && completedYear >= year) {
    if (!Number.isInteger(configuredYear) || configuredYear < year) {
      await prisma.setting.update({
        where: { key: "fiscalYear" },
        data: { value: String(year) },
      });
    }
    return { year, resetPerformed: false };
  }

  const existingCount = await prisma.leaveBalance.count({
    where: { year },
  });

  if (existingCount > 0) {
    if (!Number.isInteger(configuredYear) || configuredYear < year) {
      await prisma.setting.update({
        where: { key: "fiscalYear" },
        data: { value: String(year) },
      });
    }
    if (lastExistingBalancesWarningYear !== year) {
      logFiscalYearEvent("warn", "leave_balance_recovery_skipped", {
        year,
        existingBalanceCount: existingCount,
        reason: "existing_records_protected",
      });
      lastExistingBalancesWarningYear = year;
    }
    return { year, resetPerformed: false };
  }

  logFiscalYearEvent("warn", "leave_balance_recovery_started", { year });
  await resetLeaveBalance(year, {
    updateFiscalYear: true,
    markAutomaticReset: true,
  });
  logFiscalYearEvent("info", "leave_balance_recovery_completed", { year });
  return { year, resetPerformed: true };
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
console.log("   - ตรวจสอบ/สร้าง Leave Balance ที่ขาดทุกวัน 00:05 (Asia/Bangkok)");
console.log("   - รีเซ็ต Document Number: วันที่ 1 ต.ค. (Asia/Bangkok)");
console.log("   - อัปเดตปีปฏิทินและวันหยุด: วันที่ 1 ม.ค. (Asia/Bangkok)");

if (process.env.NODE_ENV !== "test") {
  cron.schedule("5 0 * * *", async () => {
  // Set timezone to Bangkok (UTC+7)
  process.env.TZ = 'Asia/Bangkok';
  
  const today = new Date();
  const fiscalYear = getFiscalYearForDate(today);
  if (today.getMonth() >= 9) {
    try {
      const result = await ensureCurrentFiscalYearBalances(today);
      console.log(
        result.resetPerformed
          ? `✅ [CRON] สร้าง Leave Balance ปี ${fiscalYear} สำเร็จ`
          : `✅ [CRON] ตรวจสอบ Leave Balance ปี ${fiscalYear} แล้ว`,
      );
    } catch (error) {
      logFiscalYearEvent("error", "scheduled_recovery_failed", {
        year: fiscalYear,
        error: error.message,
      });
    }
  }

  if (today.getMonth() === 9 && today.getDate() === 1) {
    try {
      await resetDocumentNumber(fiscalYear);
    } catch (error) {
      logFiscalYearEvent("error", "document_number_reset_failed", {
        year: fiscalYear,
        error: error.message,
      });
    }
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
  }, { timezone: FISCAL_YEAR_TIME_ZONE });

  ensureCurrentFiscalYearBalances()
    .then(({ year, resetPerformed }) => {
      if (resetPerformed) return resetDocumentNumber(year);
      return null;
    })
    .catch((error) => {
      logFiscalYearEvent("error", "startup_recovery_failed", {
        error: error.message,
      });
    });
}

module.exports = {
  resetLeaveBalance,
  resetDocumentNumber,
  ensureCurrentFiscalYearBalances,
  getFiscalYearForDate,
};
