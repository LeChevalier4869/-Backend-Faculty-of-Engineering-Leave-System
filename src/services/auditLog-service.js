const prisma = require('../config/prisma');

class AuditLogService {
    static async createLog(userId, action, requestId, details) {
        return await prisma.auditLogs.create({
            data: { userId, action, requestId, details },
        });
    }
    static async getLogsByRequestId(requestId) {
        return await prisma.auditLogs.findMany({
            where: { requestId },
        });
    }
}
module.exports = AuditLogService;