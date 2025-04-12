const prisma = require("../config/prisma");

class AuditLogService {
  //สร้าง Log เพื่อเก็บการกระทำของผู้ใช้งาน
  static async createLog(userId, action, leaveRequestId, details) {
    return await prisma.auditlog.create({
      data: {
        userId,
        leaveRequestId,
        action,
        details,
      },
    });
  }
  //ดึง Log ทั้งหมดของคำขอลานี้
  static async getLogsByLeaveRequestId(leaveRequestId) {
    return await prisma.auditlog.findMany({
      where: { leaveRequestId },
      orderBy: { createdAt: "asc" },
      include: {
        user: {
          select: {
            id: true,
            prefixName: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
    });
  }
}
module.exports = AuditLogService;
