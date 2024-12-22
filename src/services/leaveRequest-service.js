const prisma = require('../config/prisma');

class LeaveRequestService {
    static async createRequest(userId, leaveTypeId, startDate, endDate, reason, isEmergency) {
        return await prisma.leaveRequests.create({
            data: {
                userId,
                leaveTypeId,
                startDate: new Date(startDate),
                endDate: new Date(endDate),
                reason,
                isEmergency,
            },
        });
    }
    static async updateRequestStatus(requestId, status, approverId) {
        return await prisma.leaveRequests.update({
            where: { id: requestId },
            data: { status, approverId },
        });
    }
}

module.exports = LeaveRequestService;