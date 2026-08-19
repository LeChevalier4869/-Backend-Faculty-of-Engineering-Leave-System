const prisma = require("../config/prisma");

class AuditLogService {
  // สร้าง Log เพื่อเก็บการกระทำของผู้ใช้งาน (Generic version)
  static async createLog(userId, action, entityType, entityId = null, details = null, ipAddress = null, userAgent = null, entityData = null) {
    // ไม่บันทึก actions ที่ไม่ต้องการ
    const excludedActions = ['LOGIN', 'LOGOUT', 'EXPORT', 'UPLOAD', 'DOWNLOAD'];
    if (excludedActions.includes(action)) {
      console.log(`=== AUDIT LOG SKIPPED ===`);
      console.log(`Action ${action} is excluded from logging`);
      return null;
    }

    console.log("=== AUDIT LOG ===");
    console.log(`User: ${userId}, Action: ${action}, Entity: ${entityType}, ID: ${entityId}`);
    if (details) console.log(`Details: ${details}`);

    try {
      // ถ้าไม่มี entityData → ดึงข้อมูล entity ปัจจุบันเสมอ
      let snapshotData = entityData;
      if (!snapshotData && entityId) {
        snapshotData = await this.getEntitySnapshot(entityType, entityId);
      }

      if (snapshotData && entityId) {
        snapshotData = this.normalizeEntityData(snapshotData, entityId);
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

  static normalizeEntityData(data, entityId) {
    if (!data || typeof data !== 'object') return data;

    const idNum = entityId != null ? parseInt(entityId) : null;
    const withId = (obj) => {
      if (!obj || typeof obj !== 'object') return obj;
      if (obj.id == null && idNum != null && !Number.isNaN(idNum)) {
        return { ...obj, id: idNum };
      }
      return obj;
    };

    if ('oldData' in data || 'newData' in data) {
      return {
        ...data,
        oldData: withId(data.oldData),
        newData: withId(data.newData),
      };
    }

    return withId(data);
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
              personnelType: { select: { id: true, name: true } },
              positionNumbers: {
                where: { isCurrent: true },
                select: {
                  positionNumber: true,
                  effectiveFrom: true,
                },
              },
            },
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

        case 'ProxyApproval':
          entity = await prisma.proxyApproval.findUnique({
            where: { id: parseInt(entityId) },
            select: {
              id: true,
              originalApproverId: true,
              proxyApproverId: true,
              approverLevel: true,
              startDate: true,
              endDate: true,
              reason: true,
              status: true,
              isDaily: true,
              dailyDate: true,
              createdAt: true,
              updatedAt: true,
              originalApprover: {
                select: {
                  id: true,
                  prefixName: true,
                  firstName: true,
                  lastName: true,
                  email: true,
                },
              },
              proxyApprover: {
                select: {
                  id: true,
                  prefixName: true,
                  firstName: true,
                  lastName: true,
                  email: true,
                },
              },
            }
          });
          break;

        case 'Organization':
          entity = await prisma.organization.findUnique({
            where: { id: parseInt(entityId) },
            select: {
              id: true,
              name: true,
            }
          });
          break;

        case 'Role':
          entity = await prisma.role.findUnique({
            where: { id: parseInt(entityId) },
            select: { id: true, name: true, description: true }
          });
          break;

        case 'Rank':
          entity = await prisma.rank.findUnique({
            where: { id: parseInt(entityId) },
          });
          break;

        case 'Setting':
          entity = await prisma.setting.findUnique({
            where: { id: parseInt(entityId) },
            select: { id: true, key: true, value: true, type: true, description: true }
          });
          break;

        case 'ApproverPosition':
          entity = await prisma.approverPosition.findUnique({
            where: { id: parseInt(entityId) },
            include: {
              user: { select: { id: true, prefixName: true, firstName: true, lastName: true } },
              organization: { select: { id: true, name: true } }
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


  // ดึงข้อมูล entity (จากตารางจริง หรือ Audit Log ถ้าถูกลบ)
  static async getEntityData(entityType, entityId) {
    try {
      // ลองดูจากตารางจริงก่อน
      let entity = await this.getEntitySnapshot(entityType, entityId);

      // ถ้าไม่เจอ ลองดูจาก Audit Log
      if (!entity) {
        const auditLog = await prisma.auditLog.findFirst({
          where: {
            entityType,
            entityId: parseInt(entityId),
            entityData: { not: null }
          },
          orderBy: { createdAt: 'desc' }
        });

        if (auditLog && auditLog.entityData) {
          entity = JSON.parse(auditLog.entityData);
        }
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

  // สร้าง Log พร้อมการเปรียบเทียบข้อมูลสำหรับ UPDATE
  static async createUpdateLog(userId, entityType, entityId, oldData, newData, ipAddress = null, userAgent = null) {
    console.log("=== AUDIT LOG (UPDATE) ===");
    console.log(`User: ${userId}, Entity: ${entityType}, ID: ${entityId}`);

    try {
      const normalizedOldData = this.normalizeEntityData(oldData, entityId);
      const normalizedNewData = this.normalizeEntityData(newData, entityId);

      // สร้าง diff ระหว่างข้อมูลเก่าและใหม่
      const diff = this.calculateDiff(normalizedOldData, normalizedNewData);

      const details = `อัปเดต${this.getEntityTypeLabel(entityType)}: ${diff.summary}`;

      // เก็บข้อมูลเก่าและใหม่ไว้ใน entityData
      const entityData = {
        oldData: normalizedOldData,
        newData: normalizedNewData,
        diff: diff.changes,
        timestamp: new Date().toISOString()
      };

      return await this.createLog(
        userId,
        'UPDATE',
        entityType,
        entityId,
        details,
        ipAddress,
        userAgent,
        entityData
      );
    } catch (error) {
      console.error('AuditLog Update Error:', error.message);
      return null;
    }
  }

  // สร้าง Log สำหรับการอนุมัติคำขอลา
  static async createApproveLog(userId, entityType, entityId, oldData, newData, approverLevel, ipAddress = null, userAgent = null) {
    console.log("=== AUDIT LOG (APPROVE) ===");
    console.log(`User: ${userId}, Entity: ${entityType}, ID: ${entityId}, Level: ${approverLevel}`);

    try {
      const normalizedOldData = this.normalizeEntityData(oldData, entityId);
      const normalizedNewData = this.normalizeEntityData(newData, entityId);
      const diff = this.calculateDiff(normalizedOldData, normalizedNewData);

      const levelLabel = this.getApproverLevelLabel(approverLevel);
      const details = `อนุมัติคำขอลา (${levelLabel})`;

      const entityData = {
        oldData: normalizedOldData,
        newData: normalizedNewData,
        diff: diff.changes,
        approverLevel,
        timestamp: new Date().toISOString()
      };

      return await this.createLog(
        userId,
        'APPROVE',
        entityType,
        entityId,
        details,
        ipAddress,
        userAgent,
        entityData
      );
    } catch (error) {
      console.error('AuditLog Approve Error:', error.message);
      return null;
    }
  }

  // สร้าง Log สำหรับการปฏิเสธคำขอลา
  static async createRejectLog(userId, entityType, entityId, oldData, newData, approverLevel, ipAddress = null, userAgent = null) {
    console.log("=== AUDIT LOG (REJECT) ===");
    console.log(`User: ${userId}, Entity: ${entityType}, ID: ${entityId}, Level: ${approverLevel}`);

    try {
      const normalizedOldData = this.normalizeEntityData(oldData, entityId);
      const normalizedNewData = this.normalizeEntityData(newData, entityId);
      const diff = this.calculateDiff(normalizedOldData, normalizedNewData);

      const levelLabel = this.getApproverLevelLabel(approverLevel);
      const details = `ปฏิเสธคำขอลา (${levelLabel})`;

      const entityData = {
        oldData: normalizedOldData,
        newData: normalizedNewData,
        diff: diff.changes,
        approverLevel,
        timestamp: new Date().toISOString()
      };

      return await this.createLog(
        userId,
        'REJECT',
        entityType,
        entityId,
        details,
        ipAddress,
        userAgent,
        entityData
      );
    } catch (error) {
      console.error('AuditLog Reject Error:', error.message);
      return null;
    }
  }

  // ดึงชื่อระดับผู้อนุมัติเป็นภาษาไทย
  static getApproverLevelLabel(level) {
    const labels = {
      1: 'ผู้อนุมัติลำดับที่ 1',
      2: 'ผู้ตรวจสอบ',
      3: 'ผู้อนุมัติลำดับที่ 2',
      4: 'ผู้อนุมัติลำดับที่ 3',
      5: 'ผู้อนุมัติลำดับที่ 4'
    };
    return labels[level] || `ระดับ ${level}`;
  }

  // คำนวณความแตกต่างระหว่างข้อมูลเก่าและใหม่
  static calculateDiff(oldData, newData) {
    const changes = [];
    let changeCount = 0;

    // เปรียบเทียบทุก key
    for (const key in newData) {
      const oldValue = oldData[key];
      const newValue = newData[key];

      if (oldValue !== newValue) {
        changes.push({
          field: key,
          oldValue,
          newValue,
          type: oldValue === undefined ? 'added' :
                newValue === undefined ? 'removed' : 'changed'
        });
        changeCount++;
      }
    }

    // ตรวจสอบ key ที่ถูกลบ
    for (const key in oldData) {
      if (!(key in newData)) {
        changes.push({
          field: key,
          oldValue: oldData[key],
          newValue: undefined,
          type: 'removed'
        });
        changeCount++;
      }
    }

    return {
      changes,
      summary: 'ข้อมูลถูกอัปเดต',
      changeCount
    };
  }

  // ดึงชื่อ entity type เป็นภาษาไทย
  static getEntityTypeLabel(entityType) {
    const labels = {
      'User': 'ผู้ใช้',
      'Department': 'แผนก',
      'LeaveRequest': 'คำขอลา',
      'LeaveType': 'ประเภทการลา',
      'Holiday': 'วันหยุด',
      'PersonnelType': 'ประเภทบุคคลากร',
      'Rank': 'ตำแหน่ง',
      'ProxyApproval': 'การมอบอำนาจ'
    };
    return labels[entityType] || entityType;
  }
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
      userName,
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

    // Filter by userName (search in user's name)
    if (userName) {
      where.user = {
        OR: [
          { firstName: { contains: userName } },
          { lastName: { contains: userName } },
          { prefixName: { contains: userName } }
        ]
      };
    }

    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate);
      if (endDate) {
        // Set end date to end of day
        const endOfDay = new Date(endDate);
        endOfDay.setHours(23, 59, 59, 999);
        where.createdAt.lte = endOfDay;
      }
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


  // นับจำนวน Log ตาม filters
  static async countLogs(filters = {}) {
    const {
      userId,
      userName,
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

    if (userName) {
      where.user = {
        OR: [
          { firstName: { contains: userName } },
          { lastName: { contains: userName } },
          { prefixName: { contains: userName } }
        ]
      };
    }

    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate);
      if (endDate) {
        const endOfDay = new Date(endDate);
        endOfDay.setHours(23, 59, 59, 999);
        where.createdAt.lte = endOfDay;
      }
    }

    return await prisma.auditLog.count({ where });
  }

  // ดึงข้อมูล Audit Log ทั้งหมด (สำหรับ Admin) - มี pagination
  static async getAllLogs(options = {}) {
    const {
      page = 1,
      limit = 50,
      userId,
      userName,
      action,
      startDate,
      endDate,
      entityType,
      entityId,
      ipAddress
    } = options;

    const filters = {
      userId,
      userName,
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
      this.countLogs({ userId, userName, action, startDate, endDate, entityType, entityId, ipAddress })
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
