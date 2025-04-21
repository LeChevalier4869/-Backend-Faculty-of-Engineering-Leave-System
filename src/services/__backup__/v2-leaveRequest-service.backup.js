const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const createError = require('../utils/createError');
const LeaveBalanceService = require('../services/leaveBalance-service');
const AuditLogService = require('../services/auditLog-service');
const cloudUpload = require('../utils/cloudUpload');
const { sendEmail } = require('../utils/emailService');
const UserService = require('../services/user-service');
const { calculateWorkingDays } = require('../utils/dateCalculate');

class LeaveRequestService {
  static async createLeaveRequest(userId, body, files) {
    const { leaveTypeId, startDate, endDate, reason, isEmergency, additionalDetails } = body;
    if (!leaveTypeId || !startDate || !endDate) {
      throw createError(400, 'กรุณากรอกข้อมูลให้ครบ');
    }
    const start = new Date(startDate);
    const end = new Date(endDate);
    if (start > end) throw createError(400, 'วันที่เริ่มต้องไม่เกินวันที่สิ้นสุด');
    const totalDays = calculateWorkingDays(start, end);

    // Check admin role
    const user = await UserService.getUserByIdWithRoles(userId);
    const roles = Array.isArray(user.role) ? user.role : [user.role];
    const isAdmin = roles.includes("ADMIN");

    let balance;
    if (!isAdmin) {
      balance = await LeaveBalanceService.getUserBalance(userId, parseInt(leaveTypeId,10));
      if (totalDays > balance.remainingDays) {
        throw createError(400, 'วันลาคงเหลือไม่เพียงพอ');
      }

      // Update pending
      await LeaveBalanceService.updatePendingLeaveBalance(userId, parseInt(leaveTypeId,10), totalDays);
    }

    // Create leave request
    const req = await prisma.leaveRequest.create({ data: {
      userId,
      leaveTypeId: parseInt(leaveTypeId,10),
      startDate: start,
      endDate: end,
      thisTimeDays: totalDays,
      totalDays,
      balanceDays: isAdmin ? 0 : balance.remainingDays,
      reason,
      status: 'PENDING',
      isEmergency: Boolean(isEmergency),
      contact: additionalDetails
    }});

    // Attach files
    if (files?.length) {
      for (const f of files) {
        const url = await cloudUpload(f.path);
        await prisma.file.create({ data: {
          leaveRequestId: req.id,
          type: 'EVIDENT',
          filePath: url
        }});
      }
    }

    // Audit log
    await AuditLogService.createLog(userId, 'Create Request', req.id, reason, 'LEAVE_REQUEST');

    // Email confirmation
    if (user) {
      await sendEmail(user.email, 'ยืนยันการยื่นคำขอลา', `<p>เรียน ${user.prefixName} ${user.firstName}</p><p>คำขอลาถูกบันทึกแล้ว</p>`);
    }

    return { id: req.id, message: 'Create success' };
  }

  static async getLeaveRequestIsMine(userId) {
    return await prisma.leaveRequest.findMany({ where: { userId }, orderBy: { startDate: 'desc' } });
  }

  static async getLeaveRequest(id, user) {
    const data = await prisma.leaveRequest.findUnique({
      where: { id },
      include: { files: true, leaveRequestDetails: { include: { approver: true } } }
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
    await prisma.leaveRequestDetail.create({ data: { leaveRequestId: id, approverId, stepOrder: 1, status: 'APPROVED' } });
    return await prisma.leaveRequest.update({ where: { id }, data: { status: 'APPROVED' } });
  }

  static async rejectLeaveRequest(id, approverId, { remarks }) {
    await prisma.leaveRequestDetail.create({ data: { leaveRequestId: id, approverId, stepOrder: 1, status: 'REJECTED', comment: remarks } });
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
