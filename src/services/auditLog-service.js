const prisma = require("../config/prisma");

class AuditLogService {
  // สร้าง Log เพื่อเก็บการกระทำของผู้ใช้งาน (Generic version)
  static async createLog(userId, action, entityType, entityId = null, details = null, ipAddress = null, userAgent = null) {
    console.log("=== AUDIT LOG ===");
    console.log(`User: ${userId}, Action: ${action}, Entity: ${entityType}, ID: ${entityId}`);
    if (details) console.log(`Details: ${details}`);
    
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
  }
}

module.exports = AuditLogService;
