const prisma = require("../config/prisma");

class AuditLogService {
<<<<<<< HEAD
  // สร้าง Log เพื่อเก็บการกระทำของผู้ใช้งาน (Generic version)
  static async createLog(userId, action, entityType, entityId = null, details = null, ipAddress = null, userAgent = null) {
    console.log("=== AUDIT LOG ===");
    console.log(`User: ${userId}, Action: ${action}, Entity: ${entityType}, ID: ${entityId}`);
    if (details) console.log(`Details: ${details}`);

=======
  //สร้าง Log เพื่อเก็บการกระทำของผู้ใช้งาน
  static async createLog(userId, action, leaveRequestId = null, details = null) {
>>>>>>> 4f8175b6186a6d5d02012d948d2d2dae2d36aee4
    try {
      return await prisma.auditLog.create({
        data: {
          userId,
          action,
          entityType,
          entityId: entityId ? parseInt(entityId) : null,
          details,
          ipAddress,
          userAgent,
          // For backward compatibility - if it's a LeaveRequest, also set leaveRequestId
          leaveRequestId: entityType === 'LeaveRequest' && entityId ? parseInt(entityId) : null,
        },
      });
    } catch (error) {
      console.error('AuditLog Error:', error.message);
      // ไม่ throw error เพื่อไม่ให้กระทบการทำงานหลัก
      // แต่ log ไว้ให้ตรวจสอบ
      return null;
    }
  }

<<<<<<< HEAD
  // สร้าง Log สำหรับ Leave Request (Backward compatibility)
  static async createLeaveRequestLog(userId, action, leaveRequestId, details) {
    return await this.createLog(userId, action, 'LeaveRequest', leaveRequestId, details);
  }

  // ดึง Log ทั้งหมดของคำขอลานี้ (Backward compatibility)
  static async getLogsByLeaveRequestId(leaveRequestId) {
    return await prisma.auditLog.findMany({
      where: {
        OR: [
          { leaveRequestId: parseInt(leaveRequestId) },
          { entityType: 'LeaveRequest', entityId: parseInt(leaveRequestId) }
        ]
      },
=======
  //ดึง Log ทั้งหมดของคำขอลานี้
  static async getLogsByLeaveRequestId(leaveRequestId) {
    return await prisma.auditLog.findMany({ 
      where: { leaveRequestId },
>>>>>>> 4f8175b6186a6d5d02012d948d2d2dae2d36aee4
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

<<<<<<< HEAD
  // ดึง Log ทั้งหมดตามเงื่อนไขต่างๆ
  static async getLogs(filters = {}) {
    const { userId, entityType, entityId, action, startDate, endDate, limit = 100, offset = 0 } = filters;

    const where = {};

    if (userId) where.userId = parseInt(userId);
    if (entityType) where.entityType = entityType;
    if (entityId) where.entityId = parseInt(entityId);
    if (action) where.action = action;

    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate);
      if (endDate) where.createdAt.lte = new Date(endDate);
    }

    return await prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: parseInt(limit),
      skip: parseInt(offset),
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

  // ดึง Log ตาม entityType และ entityId
  static async getLogsByEntity(entityType, entityId) {
    return await prisma.auditLog.findMany({
      where: {
        entityType,
        entityId: parseInt(entityId)
      },
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
      },
    });
  }

  // นับจำนวน Log ตาม filters
  static async countLogs(filters = {}) {
    const { userId, entityType, entityId, action, startDate, endDate } = filters;

    const where = {};

    if (userId) where.userId = parseInt(userId);
    if (entityType) where.entityType = entityType;
    if (entityId) where.entityId = parseInt(entityId);
    if (action) where.action = action;

    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate);
      if (endDate) where.createdAt.lte = new Date(endDate);
    }

    return await prisma.auditLog.count({ where });
=======
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
>>>>>>> 4f8175b6186a6d5d02012d948d2d2dae2d36aee4
  }
}

module.exports = AuditLogService;
