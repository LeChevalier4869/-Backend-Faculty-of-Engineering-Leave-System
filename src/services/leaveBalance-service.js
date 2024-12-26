const prisma = require('../config/prisma');
const createError = require('../utils/createError');

class LeaveBalanceService {
    static async getUserBalance(userId, leaveTypeId) {
        return await prisma.leaveBalances.findFirst({
            where: { userId, leaveTypeId },
        });
    }
    static async updateLeaveBalance(userId, leaveTypeId, usedDays) {
        const balance = await this.getUserBalance(userId, leaveTypeId);
        if (!balance || balance.totalDays <  usedDays) {
            throw createError(400, 'Leave balance is not enough.');
        }
        return await prisma.leaveBalances.update({
            where: { id: balance.id },
            data: { usedDays: balance.usedDays + usedDays },
        });
    }
}

module.exports = LeaveBalanceService;