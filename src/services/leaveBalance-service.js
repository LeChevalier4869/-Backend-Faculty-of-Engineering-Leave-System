const prisma = require("../config/prisma");
const createError = require("../utils/createError");

class LeaveBalanceService {
    // ดึง Leave balance ของ user สำหรับ leaveType หนึ่ง
    static async getUserBalance(userId, leaveTypeId) {
        return await prisma.leaveBalance.findFirst({
            where: {
                userId,
                leaveTypeId,
            },
        });
    }

    // ดึง leave balance by userId
    static async getLeaveBalanceByUserId(userId) {
        return await prisma.leaveBalance.findUnique({ where: { id: userId } });
    }

    // ดึง Leave balance ทั้งหมด
    static async getAllBalancesForUser(userId) {
        return await prisma.leaveBalance.findMany({
            where: { userId },
            include: {
                leaveType: {
                    select: {
                        name: true,
                        isAvailable: true,
                    }
                }
            },
            orderBy: { leaveTypeId: "asc" },
        });
    }

    // ทำ pending day ตอนยื่น leave request
    static async updatePendingLeaveBalance(userId, leaveTypeId, requestedDays) {
        const balance = await this.getUserBalance(userId, leaveTypeId);
        if (!balance) throw createError(404, "ไม่พบข้อมูลสิทธิ์การลา");

        return await prisma.leaveBalance.update({
            where: { id: balance.id },
            data: {
                pendingDays: balance.pendingDays + requestedDays,
                remainingDays: balance.remainingDays - requestedDays,
            },
        });
    }

    // หลังจากอนุมัติเสร็จแล้วจะหัก usedDays
    static async finalizeLeaveBalance(userId, leaveTypeId, approvedDays) {
        const balance = await this.getUserBalance(userId, leaveTypeId);
        if (!balance) throw createError(404, "ไม่พบข้อมูลสิทธิ์การลา");
        
        return await prisma.leaveBalance.update({
            where: { id: balance.id },
            data: {
                pendingDays: balance.pendingDays - approvedDays,
                usedDays: balance.usedDays + approvedDays,
            },
        });
    }

    //ถ้าถูก reject จะคืน pending
    static async rollbackPendingDays(userId, leaveTypeId, rollbackDays) {
        const balance = await this.getUserBalance(userId, leaveTypeId);
        if (!balance) throw createError(404, "ไม่พบข้อมูลสิทธิ์การลา");

        return await prisma.leaveBalance.update({
            where: { id: balance.id },
            data: {
                pendingDays: balance.pendingDays - rollbackDays,
                remainingDays: balance.remainingDays + rollbackDays,
            }
        });
    }

    // สร้าง balance เริ่มต้น หรือ reset
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
}

module.exports = LeaveBalanceService;