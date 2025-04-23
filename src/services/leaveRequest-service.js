const prisma = require("../config/prisma");
const createError = require("../utils/createError");
const UserService = require("../services/user-service");
const LeaveBalanceService = require("./leaveBalance-service");
const RankService = require("./rank-service");
const AuditLogService = require("./auditLog-service");
const { calculateWorkingDays } = require("../utils/dateCalculate");
const { sendNotification, sendEmail } = require("../utils/emailService");

class LeaveRequestService {
  // ────────────────────────────────
  // 🟢 CREATE
  // ────────────────────────────────

  // สร้างคำขอลา
  static async createRequest(
    userId,
    leaveTypeId,
    startDate,
    endDate,
    reason,
    contact
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
        //isEmergency: Boolean(isEmergency? isEmergency : false),
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

    //sent email ให้หัวหน้าสาขา สำหรับ การแจ้งเตือนว่ามีการ create request
    const approver = await UserService.getUserByIdWithRoles(user.department.headId);
    if (approver) {
      const approverEmail = approver.email;
      const approverName = `${approver.prefixName} ${approver.firstName} ${approver.lastName}`;

      const subject = "ยืนยันการยื่นคำขอลา";
      const message = `
        <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
          <h3 style="color: #2c3e50;">เรียน ${approverName},</h3>
          <p>คุณได้รับการแจ้งเตือนเกี่ยวกับคำขอลาใหม่จากระบบจัดการวันลาคณะวิศวกรรมศาสตร์</p>
          <p><strong>รายละเอียดคำขอลา:</strong></p>
          <ul style="list-style: none; padding: 0;">
            <li><strong>ผู้ยื่นคำขอ:</strong> ${user.prefixName} ${user.firstName} ${user.lastName}</li>
            <li><strong>จำนวนวันลา:</strong> ${requestedDays} วัน</li>
            <li><strong>เหตุผล:</strong> ${reason}</li>
            ${contact ? `<li><strong>ติดต่อ:</strong> ${contact}</li>` : ""}
          </ul>
          <p>กรุณาตรวจสอบและดำเนินการในระบบตามขั้นตอนที่กำหนด</p>
          <br/>
          <p style="color: #7f8c8d;">ขอแสดงความนับถือ,</p>
          <p style="color: #7f8c8d;">ระบบจัดการวันลาคณะวิศวกรรมศาสตร์</p>
          <hr style="border: none; border-top: 1px solid #ddd; margin: 20px 0;">
          <p style="font-size: 12px; color: #95a5a6;">หมายเหตุ: อีเมลนี้เป็นการแจ้งเตือนอัตโนมัติ กรุณาอย่าตอบกลับ</p>
        </div>
      `;
      await sendEmail(approverEmail, subject, message);
    }

    return leaveRequest;
  }

  // ────────────────────────────────
  // 🔎 READ
  // ────────────────────────────────

  static async getRequestsById(requestId) {
    return await prisma.leaveRequest.findMany({
      where: { id: Number(requestId) },
      include: {
        user: {
          select: {
            id: true,
            prefixName: true,
            firstName: true,
            lastName: true,
          },
        },
        leaveType: true,
        leaveRequestDetails: true,
        files: true,
      },
    });
  }

  static async getRequestIsMine(userId) {
    return await prisma.leaveRequest.findMany({
      where: { userId },
      include: {
        user: {
          select: {
            prefixName: true,
            firstName: true,
            lastName: true,
          },
        },
        leaveType: true,
        leaveRequestDetails: true,
        files: true,
      },
    });
  }

  static async getLanding() {
    return await prisma.leaveRequest.findMany({
      where: { status: "PENDING" },
      include: {
        leaveType: true,
        user: {
          include: {
            department: true,
            leaveBalances: true,
          }
        }
      }
    });
  }

  static async getApprovalSteps(requestId) {
    return await prisma.leaveRequestDetail.findMany({
      where: { leaveRequestId: requestId },
      orderBy: { stepOrder: "asc" },
      include: {
        approver: {
          select: {
            prefixName: true,
            firstName: true,
            lastName: true,
            email: true,
          }
        }
      },
    });
  }

  // ────────────────────────────────
  // 🔁 UPDATE
  // ────────────────────────────────

  //แนบไฟล์-------------------------------------------------------------------------------------------------
  static async attachImages(imageDataArray) {
    return await prisma.file.createMany({ data: imageDataArray });
  }

  static async updateRequest(requestId, updateData) {
    return await prisma.leaveRequest.update({
      where: { id: requestId },
      data: updateData,
    });
  }

  // ใช้ logic กลาง updateRequestStatus
  static async approveRequest(requestId, approverId, documentNumber = null) {
    return await this.updateRequestStatus(requestId, "APPROVED", approverId, null, documentNumber);
  }

  static async rejectRequest(requestId, approverId, remarks = null) {
    return await this.updateRequestStatus(requestId, "REJECTED", approverId, remarks);
  }

  // อัพเดตสถานะตาม step
  static async updateRequestStatus(
    requestId,
    status,
    approverId,
    remarks = null,
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

    // ตรวจสอบว่าผู้อนุมัติก่อนหน้าอนุมัติแล้วหรือไม่ (ถ้ามี)
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

    // ถ้าเป็น receiver จะทำการอัปเดตเลขที่เอกสาร
    if (documentNumber && status === "APPROVED") {
      await prisma.leaveRequest.update({
        where: { id: requestId },
        data: {
          documentNumber,
          documentIssuedDate: new Date(),
        },
      });
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
      return { message: "คำขอถูกปฏิเสธแล้ว" };
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

      // ส่งแจ้งเตือนให้ Approver step ถัดไป ********
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

  // ────────────────────────────────
  // ❌ DELETE
  // ────────────────────────────────

  static async deleteRequest(requestId) {
    const request = await prisma.leaveRequest.findUnique({ where: { id: requestId } });
    if (!request) return null;
    if (request.status !== "PENDING") throw createError(400, "ไม่สามารถลบคำขอที่อนุมัติหรือปฏิเสธแล้วได้"); 
    await prisma.leaveRequest.delete({ where: { id: requestId } });
    return true;
  }

  // ────────────────────────────────
  // 🔒 UTIL
  // ────────────────────────────────

  // ตรวจสอบสิทธิ์ลา
  static async checkEligibility(userId, leaveTypeId, requestedDays) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        personnelType: true,
      },
    });
    if (!user) throw createError(404, "ไม่พบข้อมูลผู้ใช้งาน");

    //const rank = await RankService.getRankForUser(user, leaveTypeId);
    const rank = await RankService.getRankForUserByLeaveType(user, leaveTypeId);
    if (!rank) {
      // console.log("Debug user: ", user);
      // console.log("Debug rank: ", rank);
      // console.log("Debug leaveTypeId: ", leaveTypeId);
      // console.log("Debug user.perId: ", user.personnelTypeId);
      return { success: false, message: "ยังไม่มีสิทธิ์ลาพักผ่อนในช่วงอายุงานปัจจุบัน!" };
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
      return { success: false, mxessage: "วันลาคงเหลือไม่เพียงพอ" };
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


  // static async createRequest(data) {
  //   const {
  //     userId,
  //     leaveTypeId,
  //     startDate,
  //     endDate,
  //     leavedDays,
  //     thisTimeDays,
  //     totalDays,
  //     balanceDays,
  //     reason,
  //     contact,
  //   } = data;

  //   console.log("44444444444444444444", userId)

  //   // 1. Find user's department
  //   const user = await prisma.user.findUnique({
  //     where: { id: userId },
  //     include: { department: true },
  //   });

  //   if (!user || !user.departmentId) {
  //     throw createError(400, 'ไม่พบแผนกของผู้ใช้');
  //   }

  //   // 2. Find department head
  //   const department = await prisma.department.findUnique({
  //     where: { id: user.departmentId },
  //   });

  //   if (!department || !department.headId) {
  //     throw createError(400, 'ไม่พบผู้อนุมัติ (หัวหน้าแผนก)');
  //   }

  //   // 3. Create LeaveRequest + LeaveRequestDetail
  //   const leaveRequest = await prisma.leaveRequest.create({
  //     data: {
  //       userId,
  //       leaveTypeId,
  //       startDate: new Date(startDate),
  //       endDate: new Date(endDate),
  //       leavedDays,
  //       thisTimeDays,
  //       totalDays,
  //       balanceDays,
  //       reason,
  //       contact,
  //       leaveRequestDetails: {
  //         create: {
  //           approverId: department.headId,
  //           stepOrder: 1,
  //         },
  //       },
  //     },
  //     include: {
  //       leaveRequestDetails: true,
  //     },
  //   });

  //   return leaveRequest;
  // }
}

module.exports = LeaveRequestService;