const prisma = require('../config/prisma');
const createError = require('../utils/createError');

class LeaveBalanceService {
    static async getUserBalance(userId, leaveTypeId) {
        if (!userId || !leaveTypeId) {
            console.log("Debug userId: ", userId);
            console.log("Debug leaveTypeId: ", leaveTypeId);
            throw createError(400, 'Invalid userId or leaveTypeId');
        }
        const leaveBalance = await prisma.leavebalances.findFirst({
            where: { userId, leaveTypeId: parseInt(leaveTypeId) },
        });

        if (!leaveBalance) {
            throw createError(400, `leave balance is ${leaveBalance}`);
        }

        return leaveBalance;
    }
    //not use
    static async updateLeaveBalance(userId, leaveTypeId, usedDays) {
        const balance = await this.getUserBalance(userId, leaveTypeId);
        if (!balance || balance.maxDays <  usedDays || balance.remainingDays <= 0) {
            throw createError(400, 'Leave balance is not enough.');
        }
        return await prisma.leavebalances.update({
            where: { id: balance.id },
            data: { 
                pendingDays: balance.pendingDays + usedDays,
                remainingDays: balance.maxDays - (balance.usedDays + usedDays) + 1,
            },
        });
    }
    static async getByUserId(userId) {
        try {
            return await prisma.leavebalances.findMany({
                where: { userId: userId },
                include: {
                    leavetypes: true,
                }
            });
        } catch (err) {
            throw createError(404, 'Leave balance not found');
        }
    }
    //use
    static async updatePendingLeaveBalance(userId, leaveTypeId, requestedDays) {
        const balance = await this.getUserBalance(userId, leaveTypeId);

        if (!balance || balance.maxDays < requestedDays || balance.remainingDays < requestedDays || balance.remainingDays <= 0) {
            throw createError(400, 'Leave balance is not enough.');
        }

        return await prisma.leavebalances.update({
            where: { id: balance.id },
            data: { 
                pendingDays: balance.pendingDays + requestedDays,  // เพิ่ม pendingDays
                remainingDays: balance.remainingDays - requestedDays,  // หักจาก remainingDays ชั่วคราว
            },
        });
    }
    static async finalizeLeaveBalance(userId, leaveTypeId, requestedDays) {
        const balance = await this.getUserBalance(userId, leaveTypeId);

        if (!balance || balance.pendingDays < requestedDays) {
            throw createError(400, 'Pending leave days are not enough.');
        }

        return await prisma.leavebalances.update({
            where: { id: balance.id },
            data: {
                usedDays: balance.usedDays + requestedDays,
                pendingDays: balance.pendingDays - requestedDays,
            }
        });
    }
}

module.exports = LeaveBalanceService;