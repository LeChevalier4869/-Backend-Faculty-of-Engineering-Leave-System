const prisma = require("../config/prisma");

class AuditLogService {
  // สร้าง Log เพื่อเก็บการกระทำของผู้ใช้งาน (Generic version)
  static async createLog(userId, action, entityType, entityId = null, details = null, ipAddress = null, userAgent = null, entityData = null) {
    console.log("=== AUDIT LOG ===");
    console.log(`User: ${userId}, Action: ${action}, Entity: ${entityType}, ID: ${entityId}`);
    if (details) console.log(`Details: ${details}`);

    try {
      // ถ้าไม่มี entityData → ดึงข้อมูล entity ปัจจุบันเสมอ
      let snapshotData = entityData;
      if (!snapshotData && entityId) {
        snapshotData = await this.getEntitySnapshot(entityType, entityId);
      }

      return await prisma.auditLog.create({
        data: {
          userId,
          action,
          entityType,
          entityId: entityId ? parseInt(entityId) : null,
          details,
          ipAddress,
          userAgent,
          entityData: snapshotData ? JSON.stringify(snapshotData) : null,
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

  // ดึงข้อมูล entity สำหรับ snapshot ก่อนลบ
  static async getEntitySnapshot(entityType, entityId) {
    try {
      let entity = null;

      switch (entityType) {
        case 'User':
          entity = await prisma.user.findUnique({
            where: { id: parseInt(entityId) },
            select: {
              id: true,
              prefixName: true,
              firstName: true,
              lastName: true,
              email: true,
              phone: true,
              position: true,
              employmentType: true,
              hireDate: true,
              department: { select: { id: true, name: true } },
              personnelType: { select: { id: true, name: true } }
            }
          });
          break;

        case 'Department':
          entity = await prisma.department.findUnique({
            where: { id: parseInt(entityId) },
            select: {
              id: true,
              name: true,
              appointDate: true,
              organization: { select: { id: true, name: true } },
              head: { select: { id: true, prefixName: true, firstName: true, lastName: true } }
            }
          });
          break;

        case 'Holiday':
          entity = await prisma.holiday.findUnique({
            where: { id: parseInt(entityId) },
            select: {
              id: true,
              date: true,
              description: true,
              fiscalYear: true,
              isRecurring: true,
              holidayType: true
            }
          });
          break;

        case 'LeaveType':
          entity = await prisma.leaveType.findUnique({
            where: { id: parseInt(entityId) },
            select: {
              id: true,
              name: true,
              isAvailable: true,
              resetOnFiscalYear: true,
              template: true
            }
          });
          break;

        case 'LeaveRequest':
          entity = await prisma.leaveRequest.findUnique({
            where: { id: parseInt(entityId) },
            select: {
              id: true,
              documentNumber: true,
              startDate: true,
              endDate: true,
              totalDays: true,
              status: true,
              leaveType: { select: { id: true, name: true } },
              user: { select: { id: true, prefixName: true, firstName: true, lastName: true } }
            }
          });
          break;

        case 'PersonnelType':
          entity = await prisma.personnelType.findUnique({
            where: { id: parseInt(entityId) },
            select: {
              id: true,
              name: true
            }
          });
          break;

        default:
          console.log(`Unsupported entity type for snapshot: ${entityType}`);
          break;
      }

      return entity;
    } catch (error) {
      console.error('Error getting entity snapshot:', error);
      return null;
    }
  }

  // ดึงข้อมูล entity จาก Audit Log (สำหรับ entity ที่ถูกลบไปแล้ว)
  static async getEntityFromAuditLog(entityType, entityId) {
    try {
      const auditLog = await prisma.auditLog.findFirst({
        where: {
          entityType,
          entityId: parseInt(entityId),
          entityData: { not: null }
        },
        orderBy: { createdAt: 'desc' }
      });

      if (auditLog && auditLog.entityData) {
        return JSON.parse(auditLog.entityData);
      }

      return null;
    } catch (error) {
      console.error('Error getting entity from audit log:', error);
      return null;
    }
  }

  // ดึงข้อมูล entity (จากตารางจริง หรือ Audit Log ถ้าถูกลบ)
  static async getEntityData(entityType, entityId) {
    try {
      // ลองดูจากตารางจริงก่อน
      let entity = await this.getEntitySnapshot(entityType, entityId);

      // ถ้าไม่เจอ ลองดูจาก Audit Log
      if (!entity) {
        entity = await this.getEntityFromAuditLog(entityType, entityId);
      }

      // ถ้ายังไม่เจอ ให้ส่ง empty object
      if (!entity) {
        return {
          entityType,
          entityId: parseInt(entityId),
          isDeleted: true,
          message: 'Entity not found in database or audit log'
        };
      }

      return entity;
    } catch (error) {
      console.error('Error getting entity data:', error);
      // ถ้าเกิด error ให้ส่ง empty object
      return {
        entityType,
        entityId: parseInt(entityId),
        isDeleted: true,
        message: 'Error retrieving entity data',
        error: error.message
      };
    }
  }
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

  // ดึง Log ทั้งหมดตามเงื่อนไขต่างๆ
  static async getLogs(filters = {}) {
    const {
      userId,
      entityType,
      entityId,
      action,
      startDate,
      endDate,
      ipAddress,
      limit = 100,
      offset = 0
    } = filters;

    const where = {};

    if (userId) where.userId = parseInt(userId);
    if (entityType) where.entityType = entityType;
    if (entityId) where.entityId = parseInt(entityId);
    if (action) where.action = action;
    if (ipAddress) where.ipAddress = ipAddress;

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
    const {
      userId,
      entityType,
      entityId,
      action,
      startDate,
      endDate,
      ipAddress
    } = filters;

    const where = {};

    if (userId) where.userId = parseInt(userId);
    if (entityType) where.entityType = entityType;
    if (entityId) where.entityId = parseInt(entityId);
    if (action) where.action = action;
    if (ipAddress) where.ipAddress = ipAddress;

    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate);
      if (endDate) where.createdAt.lte = new Date(endDate);
    }

    return await prisma.auditLog.count({ where });
  }

  // ดึงข้อมูล Audit Log ทั้งหมด (สำหรับ Admin) - มี pagination
  static async getAllLogs(options = {}) {
    const {
      page = 1,
      limit = 50,
      userId,
      action,
      startDate,
      endDate,
      entityType,
      entityId,
      ipAddress
    } = options;

    const filters = {
      userId,
      action,
      startDate,
      endDate,
      entityType,
      entityId,
      ipAddress,
      limit,
      offset: (page - 1) * limit
    };

    const [logs, total] = await Promise.all([
      this.getLogs(filters),
      this.countLogs({ userId, action, startDate, endDate, entityType, entityId, ipAddress })
    ]);

    return {
      logs,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    };
  }

  // ดึงข้อมูล Audit Log ตาม userId - มี pagination
  static async getLogsByUserId(userId, options = {}) {
    const {
      page = 1,
      limit = 50,
      action,
      startDate,
      endDate,
      entityType,
      entityId,
      ipAddress
    } = options;

    const filters = {
      userId,
      action,
      startDate,
      endDate,
      entityType,
      entityId,
      ipAddress,
      limit,
      offset: (page - 1) * limit
    };

    const [logs, total] = await Promise.all([
      this.getLogs(filters),
      this.countLogs({ userId, action, startDate, endDate, entityType, entityId, ipAddress })
    ]);

    return {
      logs,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    };
  }

  // ดึงข้อมูลสถิติการกระทำ (สำหรับ Dashboard)
  static async getActionStats(startDate, endDate) {
    const where = {};

    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate);
      if (endDate) where.createdAt.lte = new Date(endDate);
    }

    const stats = await prisma.auditLog.groupBy({
      by: ['action'],
      where,
      _count: {
        id: true
      },
      orderBy: {
        _count: {
          id: 'desc'
        }
      }
    });

    return stats.map(stat => ({
      action: stat.action,
      count: stat._count.id
    }));
  }

  // สร้าง Log สำหรับการกระทำของผู้ใช้ (สำหรับระบบอัตโนมัติ)
  static async logUserAction(userId, action, details = null) {
    return await this.createLog(userId, action, 'UserAction', null, details);
  }
}

module.exports = AuditLogService;
