const prisma = require("../config/prisma");

class AuditLogService {
  static async createLog(userId, action, requestId, details) {
    return await prisma.auditLogs.create({
      data: {
        action,
        details,
        user: {
          connect: {
            id: userId,
          },
        },
        leaveRequest: {
            connect: {
                id: requestId
            }
        },
        createdAt: new Date(),
      },
    });
  }
  static async getLogsByRequestId(requestId) {
    return await prisma.auditLogs.findMany({
      where: { requestId },
    });
  }
}
module.exports = AuditLogService;
