const prisma = require("../config/prisma");

class AuditLogService {
  //สร้าง Log เพื่อเก็บการกระทำของผู้ใช้งาน
  static async createLog(userId, action, leaveRequestId, details) {
    console.log(
      "0000000000000000000000000000000000000000000000000000000000000000"
    );
    console.log(userId);
    console.log(action);
    console.log(leaveRequestId);
    console.log(details);
    try {
      return await prisma.auditLog.create({ // แก้เป็น PascalCase
        data: {
          userId,
          leaveRequestId,
          action,
          details,
        },
      });
    } catch (error) {
      throw error; // หรือทำการจัดการข้อผิดพลาดตามที่ต้องการ
    }
  }
  //ดึง Log ทั้งหมดของคำขอลานี้
  static async getLogsByLeaveRequestId(leaveRequestId) {
    return await prisma.auditLog.findMany({ // แก้เป็น PascalCase
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
