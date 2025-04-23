const prisma = require("../config/prisma");
const createError = require("../utils/createError");

class LeaveBalanceService {
  /**
   * Get the leave balance record for a specific user and leave type.
   * Returns null if not found.
   */
  static async getUserBalance(userId, leaveTypeId) {
    return await prisma.leaveBalance.findFirst({
      where: { userId: parseInt(userId), leaveTypeId : parseInt(leaveTypeId) },
    });
  }

  /**
   * Get all leave balances for a user, including leave type details.
   */
  static async getAllBalancesForUser(userId) {
    return await prisma.leaveBalance.findMany({
      where: { userId },
      include: { leaveType: { select: { name: true, isAvailable: true } } },
      orderBy: { leaveTypeId: "asc" },
    });
  }

  /**
   * Increment pendingDays and decrement remainingDays when creating a leave request.
   */
  static async updatePendingLeaveBalance(userId, leaveTypeId, requestedDays) {
    const balance = await this.getUserBalance(userId, leaveTypeId);
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
  
    return await prisma.leaveBalance.update({
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
  static async finalizeLeaveBalance(userId, leaveTypeId, approvedDays) {
    const balance = await this.getUserBalance(parseInt(userId), parseInt(leaveTypeId));

    if (!balance) {
      throw createError(404, 'ไม่พบข้อมูลสิทธิ์การลาสำหรับผู้ใช้งานนี้ กรุณาติดต่อผู้ดูแลระบบ');
    }

    return await prisma.leaveBalance.update({
      where: { id: balance.id },
      data: {
        pendingDays: balance.pendingDays - approvedDays,
        usedDays: balance.usedDays + approvedDays,
      },
    });
  }

  /**
   * If a leave request is rejected, rollback pendingDays and restore remainingDays.
   */
  static async rollbackPendingDays(userId, leaveTypeId, rollbackDays) {
    let balance = await this.getUserBalance(userId, parseInt(leaveTypeId, 10));

    if (!balance) {
      balance = await this.initializeLeaveBalance(userId, parseInt(leaveTypeId, 10), 10);
    }

    return await prisma.leaveBalance.update({
      where: { id: balance.id },
      data: {
        pendingDays: balance.pendingDays - rollbackDays,
        remainingDays: balance.remainingDays + rollbackDays,
      },
    });
  }

  /**
   * Create a new leaveBalance record with specified maxDays.
   */
  static async initializeLeaveBalance(userId, leaveTypeId, maxDays) {
    return await prisma.leaveBalance.create({
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
  static async getBalanceById(balanceId) {
    const balance = await prisma.leaveBalance.findUnique({
      where: { id: balanceId },
    });
    if (!balance) {
      throw createError(404, "ไม่พบข้อมูลสิทธิ์การลา");
    }
    return balance;
  }
}

module.exports = LeaveBalanceService;
