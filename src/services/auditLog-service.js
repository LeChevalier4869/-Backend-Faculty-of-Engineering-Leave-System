const prisma = require("../config/prisma");

class AuditLogService {
  static async createLog(userId, action, requestId, details) {
    return await prisma.auditlogs.create({
      data: {
        action,
        details,
        users: {
          connect: {
            id: userId,
          },
        },
        leaverequests: {
            connect: {
                id: requestId
            }
        },
        createdAt: new Date(),
      },
    });
  }
  static async getLogsByRequestId(requestId) {
    return await prisma.auditlogs.findMany({
      where: { requestId },
    });
  }
}
module.exports = AuditLogService;
