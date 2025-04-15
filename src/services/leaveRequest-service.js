const prisma = require("../config/prisma");
const createError = require("../utils/createError");
const UserService = require("../services/user-service");
const LeaveBalanceService = require("./leaveBalance-service");
const RankService = require("./rank-service");
const AuditLogService = require("./auditLog-service");
const { calculateWorkingDays } = require("../utils/dateCalculate");
const { sendNotification } = require("../utils/emailService");

// ในการ update leave request สามารถใช้ updateRequestStatus ได้แบบ Dynamics
// หรือ แยกแบบ approved or rejected ได้ที่ approved or rejected method

/** Descriptions
 * LeaveRequestService - บริการจัดการคำขอลา
 * - checkEligibility: ตรวจสอบสอทธิ์การลาพักผ่อน /
 * - createRequest: สร้างคำขอลา
 * - updateRequestStatus: อัปเดตสถานะคำขอลา
 * - getRequests: ดึงข้อมูลคำขอลาทั้งหมด
 * - getRequestsById: ดึงข้อมูลคำขอลาตาม ID
 * - updateRequest: อัปเดตคำขอลา
 * - approveRequest: อนุมัติคำขอลา
 * - rejectRequest: ปฏิเสธคำขอลา
 * - deleteRequest: ลบคำขอลา
 * - getLanding: ดึงคำขอลาที่ยังค้างอยู่
 * - getApprovalSteps: ดึงขั้นตอนการอนุมัติ
 * - updateDocumentInfo: อัปเดตข้อมูลเอกสาร
 * - getRequestForVerifier: ดึงคำขอลาสำหรับผู้ตรวจสอบ
 * - getRequestForReceiver: ดึงคำขอลาสำหรับผู้รับเอกสาร
 */

class LeaveRequestService {
  // ตรวจสอบสิทธิ์ลา
  static async checkEligibility(userId, leaveTypeId, requestedDays) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        personnelType: true,
      },
    });
    if (!user) throw createError(404, "ไม่พบข้อมูลผู้ใช้งาน");

    const leaveType = await prisma.leaveType.findUnique({ where: { id: leaveTypeId } });
    if (!leaveType) throw createError(404, "ไม่พบประเภทการลา");

    // for ลาพักผ่อน
    if (leaveType.name !== "ลาพักผ่อน") {
      return { success: true, message: "ไม่ใช่การลาพักผ่อน จึงไม่มีการตรวจสอบ Rank" };
    }

    const rank = await RankService.getRankForUser(user);
    if (!rank) {
      return { success: false, message: "ยังไม่มีสิทธิ์ลาพักผ่อนในช่วงอายุงานปัจจุบัน" };
    }

    if (requestedDays > rank.receiveDays) {
      return { success: false, message: `จำนวนวันที่ลาขอเกินสิทธิ์ที่กำหนด (${rank.receiveDays} วัน)` };
    }

    const balance = await prisma.leaveBalance.findFirst({
      where: {
        userId,
        leaveTypeId,
      },
    });

    if (!balance) {
      return { success: false, message: "ไม่พบข้อมูล Leave Balance ของคุณ" };
    }

    if (requestedDays > balance.remainingDays) {
      return { success: false, message: "วันลาคงเหลือไม่เพียงพอ" };
    }

    return {
      success: true,
      message: "ผ่านการตรวจสอบสิทธิ์ลาพักผ่อน",
      rankInfo: {
        rank: rank.rank,
        receiveDays: rank.receiveDays,
        maxDays: rank.maxDays,
        isBalance: rank.isBalance,
      },
      balance,
    };
  }

  // สร้างคำขอลา
  static async createRequest(
    userId,
    leaveTypeId,
    startDate,
    endDate,
    reason,
    isEmergency,
  ) {
    if (!userId || !leaveTypeId || !startDate || !endDate) {
      throw createError(400, "ข้อมูลไม่ครบถ้วน");
    }

    const start = new Date(startDate);
    const end = new Date(endDate);
    const requestedDays = await calculateWorkingDays(start, end);
    if (requestedDays <= 0) {
      throw createError(400, "จำนวนวันลาต้องมากกว่า 0");
    }

    const eligibility = await this.checkEligibility(
      userId,
      leaveTypeId,
      requestedDays
    );

    // console.log("Debug eligibility id: ", eligibility.departmentId.departmentId);

    if (!eligibility.success) throw createError(400, eligibility.message);

    const { balance } = eligibility;
    const verifier = await UserService.getVerifier();
    const receiver = await UserService.getReceiver();
    if (!verifier || !receiver) throw createError(500, "ไม่พบผู้ตรวจสอบหรือผู้รับหนังสือ");

    const leaveRequest = await prisma.leaveRequest.create({
      data: {
        userId,
        leaveTypeId,
        startDate: start,
        endDate: end,
        leavedDays: requestedDays,
        thisTimeDays: requestedDays,
        totalDays: balance.usedDays + requestedDays,
        balanceDays: balance.remainingDays,
        reason,
        isEmergency: Boolean(isEmergency),
        contact,
        verifierId: verifier.id,
        receiverId: receiver.id,
        status: "PENDING",
      },
    });

    // เพิ่ม approval step แรก
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { department: true },
    });
    if (!user?.department?.headId) throw createError(500, "ไม่พบหัวหน้าสาขา");

    await prisma.leaveRequestDetail.create({
      data: {
        leaveRequestId: leaveRequest.id,
        approverId: user.department.headId,
        stepOrder: 1,
        status: "PENDING",
      },
    });

    return leaveRequest;
  }
  // อัพเดตสถานะตาม step
  static async updateRequestStatus(
    requestId,
    status,
    approverId,
    remarks,
    documentNumber = null
  ) {
    if (!requestId || !status || !approverId) {
      throw createError(400, "ข้อมูลไม่ครบถ้วน");
    }

    const leaveRequest = await prisma.leaveRequest.findUnique({
      where: { id: requestId },
      include: { leaveRequestDetails: true },
    });

    if (!leaveRequest) {
      throw createError(404, "ไม่พบคำขอลา");
    }

    const currentStep = await prisma.leaveRequestDetail.findFirst({
      where: {
        leaveRequestId: requestId,
        approverId,
        status: "PENDING",
      },
      orderBy: { stepOrder: "asc" },
    });
    if (!currentStep) {
      throw createError(403, "คุณไม่มีสิทธิ์อัปเดตสถานะในขั้นตอนนี้ หรือได้อนุมัติไปแล้ว");
    }

    // ตรวจสอบว่าผู้อนุมัติก่อนหน้าอนุมัติแล้วหรือไม่
    if (currentStep.stepOrder > 1) {
      const prevStep = await prisma.leaveRequestDetail.findFirst({
        where: {
          leaveRequestId: requestId,
          stepOrder: currentStep.stepOrder - 1,
          status: "APPROVED",
        },
      });

      if (!prevStep) {
        throw createError(
          400,
          "ยังไม่สามารถอนุมัติได้ โปรดรอขั้นก่อนหน้าอนุมัติก่อน"
        );
      }
    }

    // อัพเดต step ปัจจุบัน
    await prisma.leaveRequestDetail.update({
      where: { id: currentStep.id },
      data: {
        status,
        reviewedAt: new Date(),
        remarks,
      },
    });

    // บันทึก log การทำงาน
    await AuditLogService.createLog(
      approverId,
      `Update Status`,
      requestId,
      `Step ${currentStep.stepOrder} → ${status}${remarks ? `(${remarks})` : ""}`,
      status === "REJECTED" ? "REJECTION" : "APPROVAL"
    );

    // ถ้า REJECTED → ปิดทุก step และ request
    if (status === "REJECTED") {
      await prisma.leaveRequest.update({ where: { id: requestId }, data: { status: "REJECTED" } });
      await prisma.leaveRequestDetail.updateMany({
        where: { leaveRequestId: requestId },
        data: { status: "REJECTED" },
      });

      const user = await UserService.getUserByIdWithRoles(leaveRequest.userId);
      if (user?.email) {
        await sendNotification("REJECTION", {
          to: user.email,
          userName: `${user.prefixName} ${user.firstName} ${user.lastName}`,
          remarks,
        });
      }
      return { message: "คำขอถูกปฏิเสธ" };
    }

    // ถ้า APPROVED → เช็คว่ามี step ถัดไปไหม
    const nextStep = await prisma.leaveRequestDetail.findFirst({
      where: {
        leaveRequestId: requestId,
        stepOrder: currentStep.stepOrder + 1,
      },
    });

    if (nextStep) {
      await prisma.leaveRequestDetail.update({ where: { id: nextStep.id }, data: { status: "PENDING" } });

      // ส่งแจ้งเตือนให้ step ถัดไป
    } else {
      // สุดท้ายแล้ว → อัปเดต leaveRequest และหัก leaveBalance
      await prisma.leaveRequest.update({ where: { id: requestId }, data: { status: "APPROVED" } });

      const leaveDays = leaveRequest.leavedDays ?? 0;
      await LeaveBalanceService.finalizeLeaveBalance(
        leaveRequest.userId,
        leaveRequest.leaveTypeId,
        leaveDays,
      );

      const user = await UserService.getUserByIdWithRoles(leaveRequest.userId);
      if (user?.email) {
        await sendNotification("FULLY_APPROVED", {
          to: user.email,
          userName: `${user.prefixName} ${user.firstName} ${user.lastName}`,
        });
      }
    }
    return { message: "สถานะคำขอได้รับการอัปเดตแล้ว" };
  }

  static async getRequestsByCondition(whereCondition) {
    if (typeof whereCondition !== "object") {
      throw createError(400, "Invalid filter conditions.");
    }
    return await prisma.leaverequests.findMany({
      where: whereCondition,
      include: {
        users: {
          select: {
            prefixName: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        leavetypes: {
          select: {
            name: true,
          },
        },
        approvalsteps: {
          select: {
            stepOrder: true,
            status: true,
            approverId: true,
          },
        },
        verifier: {
          select: {
            prefixName: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        receiver: {
          select: {
            prefixName: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
    });
  }
  static async getRequestsById(requestId) {
    if (!requestId || isNaN(requestId)) {
      console.log("Debug requestId: ", requestId);
      throw createError(400, "Invalid request ID.");
    }
    return await prisma.leaverequests.findMany({
      where: { id: Number(requestId) },
      include: {
        verifier: {
          select: {
            prefixName: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        receiver: {
          select: {
            prefixName: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        users: {
          select: {
            prefixName: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        leavetypes: {
          select: {
            name: true,
          },
        },
        approvalsteps: {
          select: {
            stepOrder: true,
            status: true,
            approverId: true,
          },
        },
        attachments: {
          select: {
            filePath: true,
          },
        },
      },
    });
  }

  //แนบไฟล์-------------------------------------------------------------------------------------------------
  static async attachImages(attachImages) {
    try {
      return await prisma.attachments.createMany({
        data: attachImages,
      });
    } catch (error) {
      throw createError(500, `Failed to attach Images: ${error.message}`);
    }
  }

  static async updateRequest(requestId, updateData) {
    try {
      return await prisma.leaverequests.update({
        where: { id: requestId },
        data: updateData,
      });
    } catch (error) {
      throw createError(
        500,
        `Failed to update leave request: ${error.message}`
      );
    }
  }
  static async approveRequest(requestId, approverId) {
    try {
      const approvedRequest = await prisma.leaverequests.update({
        where: { id: requestId },
        data: {
          status: "APPROVED",
          approvalsteps: {
            create: {
              stepOrder: 1,
              status: "APPROVED",
              approverId: approverId, //คนที่เข้าสู่ระบบจะเป็นคนอนุมัติ
            },
          },
        },
      });

      await prisma.auditlogs.create({
        data: {
          action: "Approved leave request",
          details: {
            leaveRequestId: requestId,
            status: "APPROVED",
          },
          users: {
            connect: {
              id: approverId,
            },
          },
          leaverequests: {
            connect: {
              id: requestId,
            },
          },
          type: "APPROVAL",
        },
      });

      return approvedRequest;
    } catch (err) {
      console.error(err);
      throw new Error("Error updating leave request status");
    }
  }
  static async rejectRequest(requestId, remarks, approverId) {
    try {
      const rejectRequest = await prisma.leaverequests.update({
        where: { id: requestId },
        data: {
          status: "REJECTED",
          approvalsteps: {
            create: {
              stepOrder: 1,
              status: "REJECTED",
              remarks: String(remarks),
              approverId: approverId,
            },
          },
        },
      });

      await prisma.auditlogs.create({
        data: {
          action: "Rejected leave request",
          details: {
            leaveRequestId: requestId,
            status: "REJECTED",
            remarks: String(remarks),
          },
          users: {
            connect: {
              id: approverId,
            },
          },
          leaverequests: {
            connect: {
              id: requestId,
            },
          },
          type: "REJECTION",
        },
      });

      return rejectRequest;
    } catch (err) {
      console.error(err);
      throw new Error("Error updating leave request status");
    }
  }
  static async deleteRequest(requestId) {
    try {
      if (!requestId || isNaN(requestId)) {
        throw createError(400, "Invalid request ID.");
      }
      const leaveRequest = await prisma.leaverequests.findUnique({
        where: {
          id: requestId,
        },
      });

      if (!leaveRequest) {
        return null;
      }

      let res = false;

      if (leaveRequest.status === "PENDING") {
        await prisma.leaverequests.delete({
          where: { id: requestId },
        });
        res = true;
      } else if (
        leaveRequest.status === "APPROVED" ||
        leaveRequest.status === "REJECTED"
      ) {
        throw createError(400, "สถานะปัจจุบันไม่สามารถยกเลิกได้");
      }

      return res;
    } catch (err) {
      throw new Error(`Error to delete leave request: ${err.message}`);
    }
  }
  static async getLanding() {
    const leaveRequests = await prisma.leaverequests.findMany({
      where: {
        status: "PENDING",
      },
      include: {
        leavetypes: true,
        users: {
          select: {
            id: true,
            prefixName: true,
            firstName: true,
            lastName: true,
            email: true,
            hireDate: true,
            inActive: true,
            phone: true,
            leavebalances: true,
          },
        },
      },
    });

    if (!leaveRequests || leaveRequests.length === 0) {
      console.log("Debug leave request: ", leaveRequests);
      throw createError(404, "Leave request not found");
    }

    return leaveRequests;
  }
  static async getApprovalSteps(requestId) {
    return await prisma.approvalsteps.findMany({
      where: { leaveRequestId: requestId },
      orderBy: { stepOrder: "asc" },
      select: {
        stepOrder: true,
        status: true,
        reviewedAt: true,
        approverId: true,
        previousApproved: true,
        users_approvalsteps_approverIdTousers: {
          select: {
            firstName: true,
            lastName: true,
          },
        },
      },
    });
  }
  static async updateDocumentInfo(requestId, verifierId, documentNumber) {
    try {
      const leaveRequest = await prisma.leaverequests.findUnique({
        where: { id: requestId },
      });

      if (!leaveRequest) {
        throw createError(404, "Leave request not found");
      }

      if (leaveRequest.verifierId !== verifierId) {
        throw createError(
          403,
          "You are not authorized to verify this request."
        );
      }

      await prisma.leaverequests.update({
        where: { id: requestId },
        data: {
          documentNumber: documentNumber,
          documentIssuedDate: new Date(),
        },
      });

      return { message: "Document info updated successfully" };
    } catch (err) {
      throw new Error(`Failed to update document info ${err.message}`);
    }
  }
  static async getRequestForVerifier(verifierId) {
    return await prisma.leaverequests.findMany({
      where: { verifierId: verifierId, status: "WAITING_FOR_VERIFICATION" },
      include: {
        users: {
          select: {
            prefixName: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
    });
  }
  static async getRequestForReceiver(receiverId) {
    return await prisma.leaverequests.findMany({
      where: { receiverId: receiverId, status: "WAITING_FOR_RECEIVER" },
      include: {
        users: {
          select: {
            prefixName: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
    });
  }
  static async getRequestIsMine(userId) {
    if (!userId) {
      throw createError(400, `user id is ${userId}`);
    }
    if (isNaN(userId)) {
      userId = parseInt(userId);
    }
    const leaveRequest = await prisma.leaverequests.findMany({
      where: { userId: userId },
      include: {
        verifier: {
          select: {
            prefixName: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        receiver: {
          select: {
            prefixName: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        users: {
          select: {
            prefixName: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        leavetypes: {
          select: {
            name: true,
            conditions: true,
          },
        },
        approvalsteps: {
          select: {
            stepOrder: true,
            status: true,
            approverId: true,
          },
        },
      },
    });
    return leaveRequest;
  }
}

function getNotificationKey(role) {
  switch (role) {
    case "VERIFIER":
      return "VERIFIER_NOTIFICATION"; // Template แจ้งเตือนสำหรับ Verifier
    case "RECEIVER":
      return "RECEIVER_NOTIFICATION"; // Template สำหรับ Receiver
    case "APPROVER_2":
      return "APPROVER2_NOTIFICATION"; // Template สำหรับ Approver_2
    case "APPROVER_3":
      return "APPROVER3_NOTIFICATION"; // Template สำหรับ Approver_3
    case "APPROVER_4":
      return "APPROVER4_NOTIFICATION"; // Template สำหรับ Approver_4
    default:
      return "DEFAULT_NOTIFICATION";
  }
}

module.exports = LeaveRequestService;
