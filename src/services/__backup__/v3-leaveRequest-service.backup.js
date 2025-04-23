// 📦 leaveRequest-service.js (combined & optimized version)
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const createError = require('../utils/createError');
const LeaveBalanceService = require('./leaveBalance-service');
const AuditLogService = require('./auditLog-service');
const cloudUpload = require('../utils/cloudUpload');
const { sendEmail } = require('../utils/emailService');
const UserService = require('./user-service');
const { calculateWorkingDays } = require('../utils/dateCalculate');


class LeaveRequestService {
  static async checkEligibility(user, leaveTypeId, totalDays) {
    const rank = await RankService.getRankForUser(user, leaveTypeId);
    if (!rank) throw createError(403, 'คุณไม่มีสิทธิ์การลาในช่วงอายุงานนี้');
    if (totalDays > rank.receiveDays) {
      throw createError(403, `คุณสามารถลาสูงสุด ${rank.receiveDays} วัน`);
    }
    return { success: true, rank };
  }

  static async createLeaveRequest(userId, body, files) {
    const { leaveTypeId, startDate, endDate, reason, isEmergency, additionalDetails } = body;

    if (!leaveTypeId || !startDate || !endDate) {
      throw createError(400, 'กรุณากรอกข้อมูลให้ครบ');
    }

    const start = new Date(startDate);
    const end = new Date(endDate);
    if (start > end) throw createError(400, 'วันที่เริ่มต้องไม่เกินวันที่สิ้นสุด');
    const daysThisTime = await calculateWorkingDays(start, end);

    const user = await UserService.getUserByIdWithRoles(userId);
    const roles = Array.isArray(user.role) ? user.role : [user.role];
    const isAdmin = roles.includes('ADMIN');

    await this.checkEligibility(user, parseInt(leaveTypeId), daysThisTime);

    let balance;
    let remainingAfter = 0;

    if (!isAdmin) {
      balance = await LeaveBalanceService.getUserBalance(userId, +leaveTypeId);
      if (daysThisTime > balance.remainingDays) {
        throw createError(400, 'วันลาคงเหลือไม่เพียงพอ');
      }
      await LeaveBalanceService.updatePendingLeaveBalance(userId, +leaveTypeId, daysThisTime);
      remainingAfter = balance.remainingDays - daysThisTime;
    }

    const leave = await prisma.leaveRequest.create({
      data: {
        userId,
        leaveTypeId: parseInt(leaveTypeId),
        startDate: start,
        endDate: end,
        reason,
        thisTimeDays: daysThisTime,
        totalDays: isAdmin ? 0 : balance.usedDays + balance.pendingDays + daysThisTime,
        balanceDays: isAdmin ? 0 : remainingAfter,
        status: 'PENDING',
        isEmergency: Boolean(isEmergency),
        contact: additionalDetails || null,
      },
    });

    if (files?.length > 0) {
      for (const f of files) {
        const url = await cloudUpload(f.path);
        await prisma.file.create({
          data: {
            leaveRequestId: leave.id,
            type: 'EVIDENT',
            filePath: url,
          },
        });
      }
    }

    await AuditLogService.createLog(userId, 'Create Request', leave.id, reason, 'LEAVE_REQUEST');

    if (user?.email) {
      await sendEmail(
        user.email,
        'ยืนยันการยื่นคำขอลา',
        `<p>เรียน ${user.prefixName} ${user.firstName}</p><p>คำขอลาถูกบันทึกแล้ว</p>`
      );
    }

    return { id: leave.id, message: 'Create success' };
  }


  static async getLeaveRequestIsMine(userId) {
    return await prisma.leaveRequest.findMany({
      where: { userId },
      orderBy: { startDate: 'desc' },
      include: {
        files: true,
        leaveType: true,
        leaveRequestDetails: true,
      },
    });
  }

  static async getLeaveRequest(id) {
    const data = await prisma.leaveRequest.findUnique({
      where: { id },
      include: {
        files: true,
        leaveRequestDetails: {
          include: { approver: true },
        },
      },
    });
    if (!data) throw createError(404, 'ไม่พบคำขอ');
    return data;
  }

  static async updateLeaveRequest(id, userId, updates) {
    const existing = await prisma.leaveRequest.findUnique({ where: { id } });
    if (!existing) throw createError(404, 'ไม่พบคำขอ');
    if (existing.userId !== userId) throw createError(403, 'ไม่อนุญาต');
    return await prisma.leaveRequest.update({ where: { id }, data: updates });
  }

  static async updateLeaveStatus(id, userId, { status, remarks, documentNumber }) {
    const data = { status };
    if (documentNumber) data.documentNumber = documentNumber;
    const updated = await prisma.leaveRequest.update({ where: { id }, data });
    await AuditLogService.createLog(userId, 'Update Status', id, remarks || '', 'LEAVE_REQUEST');
    return updated;
  }

  static async approveLeaveRequest(id, approverId) {
    await prisma.leaveRequestDetail.create({
      data: {
        leaveRequestId: id,
        approverId,
        stepOrder: 1,
        status: 'APPROVED',
      },
    });
    return await prisma.leaveRequest.update({ where: { id }, data: { status: 'APPROVED' } });
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
    return await prisma.leaveRequest.update({ where: { id }, data: { status: 'REJECTED' } });
  }

  static async deleteLeaveRequest(id, userId) {
    const existing = await prisma.leaveRequest.findUnique({ where: { id } });
    if (!existing) throw createError(404, 'ไม่พบคำขอ');
    if (existing.userId !== userId) throw createError(403, 'ไม่อนุญาต');
    return await prisma.leaveRequest.delete({ where: { id } });
  }

  static async getLeaveRequestLanding() {
    const total = await prisma.leaveRequest.count();
    const pending = await prisma.leaveRequest.count({ where: { status: 'PENDING' } });
    const approved = await prisma.leaveRequest.count({ where: { status: 'APPROVED' } });
    const rejected = await prisma.leaveRequest.count({ where: { status: 'REJECTED' } });
    return { total, pending, approved, rejected };
  }
}

module.exports = LeaveRequestService;
