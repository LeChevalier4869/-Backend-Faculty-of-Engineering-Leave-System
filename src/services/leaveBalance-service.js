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
    return await db.leaveBalance.findFirst({
      where: { userId: uid, leaveTypeId: ltid },
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
      include: { leaveType: { select: { name: true, isAvailable: true } } },
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
}

module.exports = LeaveBalanceService;
