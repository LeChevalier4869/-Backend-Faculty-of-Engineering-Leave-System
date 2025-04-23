// 📦 leaveRequest-service.js (refactored version)
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const createError = require('../utils/createError');
const LeaveBalanceService = require('./leaveBalance-service');
const AuditLogService = require('./auditLog-service');
const cloudUpload = require('../utils/cloudUpload');
const { sendEmail } = require('../utils/emailService');
const UserService = require('./user-service');
const RankService = require('./rank-service');
const { calculateWorkingDays } = require('../utils/dateCalculate');

class LeaveRequestService {
  static async checkEligibility(userId, leaveTypeId, totalDays) {
    const rank = await RankService.getRankForUser(userId, leaveTypeId);
    if (!rank) {
      throw createError(403, 'คุณไม่มีสิทธิ์การลาในช่วงอายุงานนี้');
    }
    if (totalDays > rank.receiveDays) {
      throw createError(403, `คุณสามารถลาสูงสุด ${rank.receiveDays} วัน`);
    }
    return rank;
  }

  static async createLeaveRequest(userId, body, files) {
    const { leaveTypeId, startDate, endDate, reason, isEmergency, additionalDetails } = body;
    if (!leaveTypeId || !startDate || !endDate) {
      throw createError(400, 'กรุณากรอกข้อมูลให้ครบ');
    }

    const start = new Date(startDate);
    const end = new Date(endDate);
    if (start > end) {
      throw createError(400, 'วันที่เริ่มต้องไม่เกินวันที่สิ้นสุด');
    }

    // คำนวณวันทำงานระหว่างวันลา
    const daysThisTime = calculateWorkingDays(start, end);

    // ตรวจสิทธิ์ตาม rank
    await this.checkEligibility(userId, leaveTypeId, daysThisTime);

    // ดึงข้อมูล user เพื่อเช็ค role
    const user = await UserService.getUserByIdWithRoles(userId);
    const roleNames = Array.isArray(user.roleNames) ? user.roleNames : [user.role];
    const isAdmin = roleNames.includes('ADMIN');

    // ถ้าไม่ใช่ admin: ดึง balance และ update pending
    let balance = null;
    if (!isAdmin) {
      balance = await LeaveBalanceService.getUserBalance(userId, +leaveTypeId);
      if (daysThisTime > balance.remainingDays) {
        throw createError(400, 'วันลาคงเหลือไม่เพียงพอ');
      }
      await LeaveBalanceService.updatePendingLeaveBalance(userId, +leaveTypeId, daysThisTime);
    }

    // สร้างคำขอลา
    const created = await prisma.leaveRequest.create({
      data: {
        userId,
        leaveTypeId: parseInt(leaveTypeId, 10),
        startDate: start,
        endDate: end,
        leavedDays: daysThisTime,
        thisTimeDays: daysThisTime,
        totalDays: isAdmin
          ? daysThisTime
          : balance.usedDays + balance.pendingDays + daysThisTime,
        balanceDays: isAdmin ? 0 : balance.remainingDays,
        reason,
        status: 'PENDING',
        isEmergency: Boolean(isEmergency),
        contact: additionalDetails || null,
      },
    });

    // แนบไฟล์ถ้ามี
    if (files?.length) {
      for (const f of files) {
        const url = await cloudUpload(f.path);
        await prisma.file.create({
          data: {
            leaveRequestId: created.id,
            type: 'EVIDENT',
            filePath: url,
          },
        });
      }
    }

    // บันทึก Audit Log
    await AuditLogService.createLog(
      userId,
      'Create Request',
      created.id,
      reason,
      'LEAVE_REQUEST'
    );

    // ส่งอีเมลแจ้งเตือนผู้ใช้
    if (user.email) {
      await sendEmail(
        user.email,
        'ยืนยันการยื่นคำขอลา',
        `<p>เรียน ${user.prefixName} ${user.firstName}</p><p>คำขอลาถูกบันทึกแล้ว (ID: ${created.id})</p>`
      );
    }

    return { id: created.id, message: 'Create success' };
  }

  static async getLeaveRequestIsMine(userId) {
    return prisma.leaveRequest.findMany({
      where: { userId },
      orderBy: { startDate: 'desc' },
      include: { files: true, leaveType: true, leaveRequestDetails: true },
    });
  }

  static async getLeaveRequest(id) {
    const data = await prisma.leaveRequest.findUnique({
      where: { id },
      include: {
        files: true,
        leaveRequestDetails: { include: { approver: true } },
      },
    });
    if (!data) {
      throw createError(404, 'ไม่พบคำขอ');
    }
    return data;
  }

  static async updateLeaveRequest(id, userId, updates) {
    const existing = await prisma.leaveRequest.findUnique({ where: { id } });
    if (!existing) {
      throw createError(404, 'ไม่พบคำขอ');
    }
    if (existing.userId !== userId) {
      throw createError(403, 'ไม่อนุญาต');
    }
    return prisma.leaveRequest.update({ where: { id }, data: updates });
  }

  static async updateLeaveStatus(id, userId, { status, remarks, documentNumber }) {
    const data = { status };
    if (documentNumber) data.documentNumber = documentNumber;
    const updated = await prisma.leaveRequest.update({ where: { id }, data });
    await AuditLogService.createLog(
      userId,
      'Update Status',
      id,
      remarks || '',
      'LEAVE_REQUEST'
    );
    return updated;
  }

  static async approveLeaveRequest(id, approverId) {
    await prisma.leaveRequestDetail.create({
      data: { leaveRequestId: id, approverId, stepOrder: 1, status: 'APPROVED' },
    });
    return prisma.leaveRequest.update({ where: { id }, data: { status: 'APPROVED' } });
  }

  static async rejectLeaveRequest(id, approverId, { remarks }) {
    await prisma.leaveRequestDetail.create({
      data: {
        leaveRequestId: id,
        approverId,
        stepOrder: 1,
        status: 'REJECTED',
        comment: remarks,
      },
    });
    return prisma.leaveRequest.update({ where: { id }, data: { status: 'REJECTED' } });
  }

  static async deleteLeaveRequest(id, userId) {
    const existing = await prisma.leaveRequest.findUnique({ where: { id } });
    if (!existing) {
      throw createError(404, 'ไม่พบคำขอ');
    }
    if (existing.userId !== userId) {
      throw createError(403, 'ไม่อนุญาต');
    }
    return prisma.leaveRequest.delete({ where: { id } });
  }

  static async getLeaveRequestLanding() {
    const [total, pending, approved, rejected] = await Promise.all([
      prisma.leaveRequest.count(),
      prisma.leaveRequest.count({ where: { status: 'PENDING' } }),
      prisma.leaveRequest.count({ where: { status: 'APPROVED' } }),
      prisma.leaveRequest.count({ where: { status: 'REJECTED' } }),
    ]);
    return { total, pending, approved, rejected };
  }
}

module.exports = LeaveRequestService;
