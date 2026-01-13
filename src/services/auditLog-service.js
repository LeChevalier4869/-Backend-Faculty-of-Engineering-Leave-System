const prisma = require("../config/prisma");

class AuditLogService {
  //สร้าง Log เพื่อเก็บการกระทำของผู้ใช้งาน
  static async createLog(userId, action, leaveRequestId = null, details = null) {
    try {
      return await prisma.auditLog.create({
        data: {
          userId,
          leaveRequestId: leaveRequestId ? parseInt(leaveRequestId) : null,
          action,
          details,
        },
      });
    } catch (error) {
      console.error('AuditLog Error:', error.message);
      // ไม่ throw error เพื่อไม่ให้กระทบการทำงานหลัก
      // แต่ log ไว้ให้ตรวจสอบ
      return null;
    }
  }

  //ดึง Log ทั้งหมดของคำขอลานี้
  static async getLogsByLeaveRequestId(leaveRequestId) {
    return await prisma.auditLog.findMany({ 
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

  //ดึง Log ทั้งหมด (สำหรับ Admin)
  static async getAllLogs(options = {}) {
    const { page = 1, limit = 50, userId, action, startDate, endDate } = options;
    
    const skip = (page - 1) * limit;
    const where = {};

    if (userId) {
      where.userId = parseInt(userId);
    }

    if (action) {
      where.action = {
        contains: action,
        mode: 'insensitive'
      };
    }

    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) {
        where.createdAt.gte = new Date(startDate);
      }
      if (endDate) {
        where.createdAt.lte = new Date(endDate);
      }
    }

    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        skip,
        take: parseInt(limit),
        orderBy: { createdAt: "desc" },
        include: {
          user: {
            select: {
              id: true,
              prefixName: true,
              firstName: true,
              lastName: true,
              email: true,
              department: {
                select: {
                  id: true,
                  name: true,
                },
              },
            },
          },
          leaveRequest: {
            select: {
              id: true,
              startDate: true,
              endDate: true,
              status: true,
              leaveType: {
                select: {
                  name: true,
                },
              },
            },
          },
        },
      }),
      prisma.auditLog.count({ where }),
    ]);

    return {
      logs,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  //ดึง Log ตาม userId
  static async getLogsByUserId(userId, options = {}) {
    const { page = 1, limit = 50, action, startDate, endDate } = options;
    
    const skip = (page - 1) * limit;
    const where = { userId: parseInt(userId) };

    if (action) {
      where.action = {
        contains: action,
        mode: 'insensitive'
      };
    }

    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) {
        where.createdAt.gte = new Date(startDate);
      }
      if (endDate) {
        where.createdAt.lte = new Date(endDate);
      }
    }

    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        skip,
        take: parseInt(limit),
        orderBy: { createdAt: "desc" },
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
          leaveRequest: {
            select: {
              id: true,
              startDate: true,
              endDate: true,
              status: true,
              leaveType: {
                select: {
                  name: true,
                },
              },
            },
          },
        },
      }),
      prisma.auditLog.count({ where }),
    ]);

    return {
      logs,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  //ดึงข้อมูลสถิติการกระทำ (สำหรับ Dashboard)
  static async getActionStats(startDate = null, endDate = null) {
    const where = {};
    
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) {
        where.createdAt.gte = new Date(startDate);
      }
      if (endDate) {
        where.createdAt.lte = new Date(endDate);
      }
    }

    const stats = await prisma.auditLog.groupBy({
      by: ['action'],
      where,
      _count: {
        action: true,
      },
      orderBy: {
        _count: {
          action: 'desc',
        },
      },
    });

    return stats.map(stat => ({
      action: stat.action,
      count: stat._count.action,
    }));
  }

  //บันทึกการกระทำเฉพาะ (Login, Logout, Create, Update, Delete)
  static async logUserAction(userId, action, details = null) {
    const actionDetails = {
      LOGIN: 'เข้าสู่ระบบ',
      LOGOUT: 'ออกจากระบบ',
      CREATE_USER: 'สร้างผู้ใช้งาน',
      UPDATE_USER: 'อัปเดตข้อมูลผู้ใช้งาน',
      DELETE_USER: 'ลบผู้ใช้งาน',
      CREATE_REQUEST: 'สร้างคำขอลา',
      UPDATE_STATUS: 'อัปเดตสถานะคำขอลา',
      CANCEL_REQUEST: 'ยกเลิกคำขอลา',
      CREATE_PROXY: 'สร้างการมอบอำนาจ',
      UPDATE_PROXY: 'อัปเดตการมอบอำนาจ',
      CANCEL_PROXY: 'ยกเลิกการมอบอำนาจ',
    };

    const actionText = actionDetails[action] || action;
    return await this.createLog(userId, actionText, null, details);
  }
}

module.exports = AuditLogService;
