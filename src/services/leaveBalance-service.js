const prisma = require("../config/prisma");
const createError = require("../utils/createError");

class LeaveBalanceService {

  static _db(opts) {
    return opts?.tx ?? prisma;
  }
  /**
   * Get the leave balance record for a specific user and leave type.
   * Returns null if not found.
   */
  static async getUserBalance(userId, leaveTypeId, opts = {}) {
    const uid = userId;
    const ltid = parseInt(leaveTypeId);

    console.log("🔍 ตรวจสอบ Leave Balance สำหรับผู้ใช้งาน:", { uid, ltid });
    if (isNaN(uid) || isNaN(ltid)) {
      throw createError(400, "userId หรือ leaveTypeId ไม่ถูกต้อง");
    }

    const db = this._db(opts);
    // Prefer fiscal year (setting.fiscalYear). If missing, fallback to latest record.
    const fiscalYearSetting = await db.setting.findUnique({
      where: { key: "fiscalYear" },
      select: { value: true },
    });
    const fiscalYear = fiscalYearSetting
      ? Number.parseInt(fiscalYearSetting.value, 10)
      : null;

    if (Number.isFinite(fiscalYear)) {
      // 🔍 หาข้อมูลปีงบประมาณก่อน ถ้าไม่มีค่อยหาปีอื่น
      const byFiscalYear = await db.leaveBalance.findFirst({
        where: { userId: uid, leaveTypeId: ltid, year: fiscalYear },
        orderBy: [{ id: "desc" }], // ดึงรายการล่าสุดของปีนั้น
      });
      if (byFiscalYear) return byFiscalYear;
    }

    // ถ้าไม่พบปีงบประมาณ ให้หาข้อมูลล่าสุดจากทั้งหมด
    return await db.leaveBalance.findFirst({
      where: { userId: uid, leaveTypeId: ltid },
      orderBy: [{ year: "desc" }, { id: "desc" }], // เรียงตามปีล่าสุด แล้วค่อยเรียงตาม ID
    });
  }

  static async getLeaveSummaryByUser(userId, opts = {}) {
    const db = this._db(opts);
    return await db.leaveBalance.findMany({
      where: { userId },
      include: {
        leaveType: {
          select: {
            name: true,
          },
        },
      },
      orderBy: [
        { leaveTypeId: 'asc' },
        { year : 'desc' },
        { id : 'desc' },
      ],
    });
  }
  /**
   * Get all leave balances for a user, including leave type details.
   */
  static async getAllBalancesForUser(userId, opts = {}) {
    const db = this._db(opts);
    return await db.leaveBalance.findMany({
      where: { userId },
      include: { leaveType: { select: { name: true, isAvailable: true, resetOnFiscalYear: true } } },
      orderBy: { leaveTypeId: "asc" },
    });
  }

  /**
   * Increment pendingDays and decrement remainingDays when creating a leave request.
   */
  static async updatePendingLeaveBalance(userId, leaveTypeId, requestedDays, opts = {}) {
    const db = this._db(opts);
    const balance = await this.getUserBalance(userId, leaveTypeId, opts);
    if (!balance) throw createError(404, "ไม่พบข้อมูลสิทธิ์การลา");

    // ตรวจสอบว่าเป็นประเภทการลาที่ไม่ต้องหักวันหรือไม่ (จาก LeaveType.isNonDeductible)
    const leaveType = await db.leaveType.findUnique({
      where: { id: Number(leaveTypeId) },
      select: { isNonDeductible: true }
    });
    
    // ตรวจสอบจาก Rank ว่าเป็นประเภทที่ไม่ต้องหักวันหรือไม่
    const userRank = await db.userRank.findFirst({
      where: {
        userId,
        rank: {
          leaveTypeId: Number(leaveTypeId)
        }
      },
      include: {
        rank: true
      }
    });

    const isNonDeductible = userRank?.rank?.receiveDays === 0 && userRank?.rank?.isBalance === 1;
    
    if (leaveType?.isNonDeductible || isNonDeductible) {
      // สำหรับประเภทการลาที่ไม่ต้องหักวัน: อัปเดตเฉพาะ pendingDays แต่ไม่คำนวณ remainingDays
      const currentPending = Number(balance.pendingDays) || 0;
      const safeRequestedDays = Number(requestedDays) || 0;
      const newPending = currentPending + safeRequestedDays;
      
      console.log(`✅ อัปเดต pendingDays สำหรับ leaveTypeId ${leaveTypeId}: ${currentPending} + ${safeRequestedDays} = ${newPending}`);
      
      return await db.leaveBalance.update({
        where: { id: balance.id },
        data: {
          pendingDays: newPending,
          // usedDays และ remainingDays คงเดิม
        },
      });
    }

    // ✅ ดึงค่าที่ต้องใช้
    const maxDays = Number(balance.maxDays) || 0;
    const usedDays = Number(balance.usedDays) || 0;
    const currentPending = Number(balance.pendingDays) || 0;
    const safeRequestedDays = Number(requestedDays) || 0;

    // ✅ คำนวณ
    const pending = currentPending + safeRequestedDays;
    const remaining = maxDays - usedDays - pending;

    console.log("✅ DEBUG:", { maxDays, usedDays, currentPending, requestedDays });

    if (
      isNaN(maxDays) || isNaN(usedDays) ||
      isNaN(currentPending) || isNaN(safeRequestedDays)
    ) {
      console.error("❌ NaN Detected:", { pending, remaining });
      throw createError(400, "ค่าที่ใช้คำนวณ leave balance ไม่ถูกต้อง");
    }

    return await db.leaveBalance.update({
      where: { id: balance.id },
      data: {
        pendingDays: pending,
        remainingDays: remaining,
      },
    });
  }


  /**
   * After approval, adjust usedDays and clear pendingDays accordingly.
   */
  static async finalizeLeaveBalance(userId, leaveTypeId, approvedDays, opts = {}) {
    const db = this._db(opts);
    const balance = await this.getUserBalance(userId, leaveTypeId, opts);

    if (!balance) {
      throw createError(404, 'ไม่พบข้อมูลสิทธิ์การลาสำหรับผู้ใช้งานนี้ กรุณาติดต่อผู้ดูแลระบบ');
    }

    // ตรวจสอบว่าเป็นประเภทการลาที่ไม่ต้องหักวันหรือไม่ (จาก LeaveType.isNonDeductible)
    const leaveType = await db.leaveType.findUnique({
      where: { id: Number(leaveTypeId) },
      select: { isNonDeductible: true }
    });
    
    // ตรวจสอบจาก Rank ว่าเป็นประเภทที่ไม่ต้องหักวันหรือไม่
    const userRank = await db.userRank.findFirst({
      where: {
        userId,
        rank: {
          leaveTypeId: Number(leaveTypeId)
        }
      },
      include: {
        rank: true
      }
    });

    const isNonDeductible = userRank?.rank?.receiveDays === 0 && userRank?.rank?.isBalance === 1;
    
    if (leaveType?.isNonDeductible || isNonDeductible) {
      // สำหรับประเภทการลาที่ไม่ต้องหักวัน: อัปเดตเฉพาะ usedDays แต่ไม่คำนวณ remainingDays
      const days = Number(approvedDays) || 0;
      const usedNow = Number(balance.usedDays) || 0;
      const pendingNow = Number(balance.pendingDays) || 0;
      
      const newUsed = usedNow + days; // เก็บวันที่ใช้ไปจริง
      const newPending = Math.max(pendingNow - days, 0); // ลด pending days
      
      console.log(`✅ อัปเดต usedDays สำหรับ leaveTypeId ${leaveTypeId}: ${usedNow} + ${days} = ${newUsed}`);
      
      return await db.leaveBalance.update({
        where: { id: balance.id },
        data: {
          usedDays: newUsed,
          pendingDays: newPending,
          // remainingDays คงเดิม (ไม่ต้องคำนวณ)
        },
      });
    }

    const days = Number(approvedDays) || 0;
    if (days <= 0) throw createError(400, 'จำนวนวันที่อนุมัติไม่ถูกต้อง');

    const pendingNow = Number(balance.pendingDays) || 0;
    const usedNow = Number(balance.usedDays) || 0;
    const remainingNow = Number(balance.remainingDays) || 0;

    const fromPending = Math.min(pendingNow, days);
    const extra = days - fromPending;
    const newPending = pendingNow - fromPending;
    const newUsed = usedNow + days;
    const newRemaining = remainingNow - extra;

    return await db.leaveBalance.update({
      where: { id: balance.id },
      data: {
        pendingDays: newPending,
        usedDays: newUsed,
        remainingDays: newRemaining,
      },
    });
  }


  /**
   * If a leave request is rejected, rollback pendingDays and restore remainingDays.
   */
  static async rollbackPendingDays(userId, leaveTypeId, rollbackDays, opts = {}) {
    const db = this._db(opts);
    let balance = await this.getUserBalance(userId, parseInt(leaveTypeId, 10), opts);

    if (!balance) {
      balance = await this.initializeLeaveBalance(userId, parseInt(leaveTypeId, 10), 10, opts);
    }

    // ตรวจสอบว่าเป็นประเภทการลาที่ไม่ต้องหักวันหรือไม่ (จาก LeaveType.isNonDeductible)
    const leaveType = await db.leaveType.findUnique({
      where: { id: Number(leaveTypeId) },
      select: { isNonDeductible: true }
    });
    
    // ตรวจสอบจาก Rank ว่าเป็นประเภทที่ไม่ต้องหักวันหรือไม่
    const userRank = await db.userRank.findFirst({
      where: {
        userId,
        rank: {
          leaveTypeId: Number(leaveTypeId)
        }
      },
      include: {
        rank: true
      }
    });

    const isNonDeductible = userRank?.rank?.receiveDays === 0 && userRank?.rank?.isBalance === 1;
    
    if (leaveType?.isNonDeductible || isNonDeductible) {
      // สำหรับประเภทการลาที่ไม่ต้องหักวัน: คืนเฉพาะ pendingDays แต่ไม่คำนวณ remainingDays
      const days = Number(rollbackDays) || 0;
      const currentPending = Number(balance.pendingDays) || 0;
      const newPending = Math.max(currentPending - days, 0);
      
      console.log(`✅ คืน pendingDays สำหรับ leaveTypeId ${leaveTypeId}: ${currentPending} - ${days} = ${newPending}`);
      
      return await db.leaveBalance.update({
        where: { id: balance.id },
        data: {
          pendingDays: newPending,
          // usedDays และ remainingDays คงเดิม
        },
      });
    }

    const days = Number(rollbackDays) || 0;
    if (days <= 0) throw createError(400, "จำนวนวันที่จะ rollback ไม่ถูกต้อง");

    const canRestore = Math.min(days, Number(balance.pendingDays) || 0);
    const newPending = Math.max((Number(balance.pendingDays) || 0) - canRestore, 0);
    const newRemaining = (Number(balance.remainingDays) || 0) + canRestore;

    return await db.leaveBalance.update({
      where: { id: balance.id },
      data: {
        pendingDays: newPending,
        remainingDays: newRemaining,
      },
    });
  }

  /**
   * Create a new leaveBalance record with specified maxDays.
   */
  static async initializeLeaveBalance(userId, leaveTypeId, maxDays, opts = {}) {
    const db = this._db(opts);
    return await db.leaveBalance.create({
      data: {
        userId,
        leaveTypeId,
        maxDays,
        usedDays: 0,
        pendingDays: 0,
        remainingDays: maxDays,
      },
    });
  }

  /**
   * Get a balance record by its ID (rarely needed).
   */
  static async getBalanceById(balanceId, opts = {}) {
    // console.log("🔍 ตรวจสอบ Leave Balance by ID:", { balanceId });
    const db = this._db(opts);
    const balance = await db.leaveBalance.findMany({
      where: { userId: balanceId },
    });
    // console.log("🔍 Found Balance:", balance);
    if (!balance) {
      throw createError(404, "ไม่พบข้อมูลสิทธิ์การลา");
    }
    return balance;
  }
/**
   * Get all available years from leave balance records
   */
  static async getAvailableYears(opts = {}) {
    const db = this._db(opts);
    
    const years = await db.leaveBalance.groupBy({
      by: ['year'],
      _count: {
        id: true
      },
      orderBy: {
        year: 'desc'
      }
    });

    return years.map(item => ({
      year: item.year,
      count: item._count.id
    }));
  }

/**
   * Delete all leave balance records for a specific year
   */
  static async deleteLeaveBalanceByYear(year, opts = {}) {
    const db = this._db(opts);
    const targetYear = parseInt(year);
    
    if (isNaN(targetYear)) {
      throw createError(400, "รูปแบบปีไม่ถูกต้อง");
    }

    // ตรวจสอบว่ามีข้อมูลจริง
    const count = await db.leaveBalance.count({
      where: { year: targetYear }
    });

    if (count === 0) {
      throw createError(404, `ไม่พบข้อมูล LeaveBalance สำหรับปี ${targetYear}`);
    }

    // ลบข้อมูล
    const result = await db.leaveBalance.deleteMany({
      where: { year: targetYear }
    });

    return {
      deletedCount: result.count,
      year: targetYear,
      message: `ลบข้อมูล LeaveBalance ปี ${targetYear} สำเร็จ`
    };
  }
}

module.exports = LeaveBalanceService;
