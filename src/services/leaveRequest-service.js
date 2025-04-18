// Updated: Refactored to match Prisma schema
const prisma = require("../config/prisma");
const createError = require("../utils/createError");
const UserService = require("../services/user-service");
const LeaveTypeService = require("../services/leaveType-service");
const LeaveBalanceService = require("./leaveBalance-service");
//const RoleAssignmentService = require("./roleAssignment-service");
const { checkLeaveEligibility } = require("../utils/checkLeaveEligibility");
const { sendNotification } = require("../utils/emailService");

class LeaveRequestService {
  static async checkEligibility(userId, leaveTypeId, requestDays) {
    const result = await checkLeaveEligibility(userId, leaveTypeId, requestDays);
    return result;
  }

  static async createRequest(userId, leaveTypeId, startDate, endDate, reason, isEmergency, requestDays) {
    if (!userId || !leaveTypeId || !startDate || !endDate) {
      throw createError(400, "Missing required fields.");
    }

    const eligibility = await this.checkEligibility(userId, leaveTypeId, requestDays);
    if (!eligibility.success) throw createError(400, eligibility.message);

    const department = await prisma.department.findUnique({
      where: { id: eligibility.departmentId.departmentId },
      select: { headId: true },
    });

    if (!department || !department.headId) throw createError(500, "Department head not found.");

    const verifier = await UserService.getVerifier();
    const receiver = await UserService.getReceiver();

    if (!verifier || !receiver) throw createError(500, "ไม่พบผู้ตรวจสอบหรือผู้รับหนังสือ");

    const [verifierExists, receiverExists] = await Promise.all([
      prisma.user.findUnique({ where: { id: verifier } }),
      prisma.user.findUnique({ where: { id: receiver } }),
    ]);
    if (!verifierExists) throw createError(500, "ไม่มีผู้ตรวจสอบ");
    if (!receiverExists) throw createError(500, "ไม่มีผู้รับหนังสือ");

    const newRequest = await prisma.leaveRequest.create({
      data: {
        userId,
        leaveTypeId: parseInt(leaveTypeId),
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        reason,
        isEmergency: Boolean(isEmergency),
        status: "PENDING",
        verifierId: verifier,
        receiverId: receiver,
      },
    });

    await prisma.leaveRequestDetail.create({
      data: {
        leaveRequestId: newRequest.id,
        approverId: department.headId,
        stepOrder: 1,
        status: "PENDING",
      },
    });

    return newRequest;
  }

  static async getRequestsById(requestId) {
    if (!requestId || isNaN(requestId)) {
      throw createError(400, "Invalid request ID.");
    }
    return await prisma.leaveRequest.findMany({
      where: { id: Number(requestId) },
      include: {
        verifier: true,
        receiver: true,
        user: true,
        leaveType: true,
        leaveRequestDetails: true,
        files: true,
      },
    });
  }

  static async attachImages(attachImages) {
    try {
      return await prisma.file.createMany({ data: attachImages });
    } catch (error) {
      throw createError(500, `Failed to attach Images: ${error.message}`);
    }
  }

  static async updateRequest(requestId, updateData) {
    try {
      return await prisma.leaveRequest.update({
        where: { id: requestId },
        data: updateData,
      });
    } catch (error) {
      throw createError(500, `Failed to update leave request: ${error.message}`);
    }
  }

  static async getRequestIsMine(userId) {
    if (!userId) throw createError(400, `user id is ${userId}`);
    if (isNaN(userId)) userId = parseInt(userId);

    return await prisma.leaveRequest.findMany({
      where: { userId },
      include: {
        verifier: true,
        receiver: true,
        user: true,
        leaveType: true,
        leaveRequestDetails: true,
      },
    });
  }
}

function getNotificationKey(role) {
  switch (role) {
    case "VERIFIER": return "VERIFIER_NOTIFICATION";
    case "RECEIVER": return "RECEIVER_NOTIFICATION";
    case "APPROVER_2": return "APPROVER2_NOTIFICATION";
    case "APPROVER_3": return "APPROVER3_NOTIFICATION";
    case "APPROVER_4": return "APPROVER4_NOTIFICATION";
    default: return "DEFAULT_NOTIFICATION";
  }
}

module.exports = LeaveRequestService;
