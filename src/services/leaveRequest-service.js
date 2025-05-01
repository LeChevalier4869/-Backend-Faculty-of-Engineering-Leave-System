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

    if (!eligibility.success) throw createError(400, eligibility.message);

    const { balance } = eligibility;
    const verifier = await UserService.getVerifier();
    const receiver = await UserService.getReceiver();
    if (!verifier || !receiver)
      throw createError(500, "ไม่พบผู้ตรวจสอบหรือผู้รับหนังสือ");

    const leaveRequest = await prisma.leaveRequest.create({
      data: {
        userId,
        leaveTypeId: parseInt(leaveTypeId),
        startDate: start,
        endDate: end,
        leavedDays: balance.usedDays,
        thisTimeDays: requestedDays,
        totalDays: balance.usedDays + requestedDays,
        balanceDays: balance.remainingDays,
        reason,
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

    // ส่งอีเมลแจ้งเตือนให้หัวหน้าสาขา
    const approver = await UserService.getUserByIdWithRoles(
      user.department.headId
    );
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
            <li><strong>ผู้ยื่นคำขอ:</strong> ${user.prefixName} ${
        user.firstName
      } ${user.lastName}</li>
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

  //
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
            position: true,
            department: {
              select: {
                id: true,
                name: true,
                organization: {
                  select: {
                    id: true,
                    name: true,
                  },
                },
              },
            },
            personnelType: {
              select: {
                id: true,
                name: true,
              },
            },
            employmentType: true, // เพิ่ม employmentType ที่นี่
            phone: true,
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

  static async findByUserId(userId) {
    console.log("Received userId:", userId); // ช่วย debug
    return await prisma.leaveRequest.findMany({
      where: { userId: Number(userId) },
      orderBy: { createdAt: "desc" },
      include: {
        user: {
          select: {
            prefixName: true,
            firstName: true,
            lastName: true,
          },
        },
        leaveType: true,
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
          },
        },
      },
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
          },
        },
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
    return await this.updateRequestStatus(
      requestId,
      "APPROVED",
      approverId,
      null,
      documentNumber
    );
  }

  static async rejectRequest(requestId, approverId, remarks = null) {
    return await this.updateRequestStatus(
      requestId,
      "REJECTED",
      approverId,
      remarks
    );
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
      throw createError(
        403,
        "คุณไม่มีสิทธิ์อัปเดตสถานะในขั้นตอนนี้ หรือได้อนุมัติไปแล้ว"
      );
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

    // อัพเดต step ปัจจุบัน (อาจจะแก้เป็น create)
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
      `Step ${currentStep.stepOrder} → ${status}${
        remarks ? `(${remarks})` : ""
      }`,
      status === "REJECTED" ? "REJECTED" : "APPROVED"
    );

    // ถ้า REJECTED → ปิดทุก step และ request
    if (status === "REJECTED") {
      await prisma.leaveRequest.update({
        where: { id: requestId },
        data: { status: "REJECTED" },
      });
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
    // ถ้า APPROVED → สร้าง step ถัดไป (ถ้ามี) และส่งอีเมลแจ้งเตือน
    const nextStepOrder = currentStep.stepOrder + 1;
    const nextApprover = await this.getNextApprover(nextStepOrder);

    if (nextApprover) {
      await prisma.leaveRequestDetail.create({
        data: {
          leaveRequestId: requestId,
          approverId: nextApprover.id,
          stepOrder: nextStepOrder,
          status: "PENDING",
        },
      });

      // ส่งแจ้งเตือนให้ Approver step ถัดไป
      if (nextApprover.email) {
        await sendNotification("NEW_STEP", {
          to: nextApprover.email,
          userName: `${nextApprover.prefixName} ${nextApprover.firstName} ${nextApprover.lastName}`,
        });
      }
    } else {
      // ถ้าไม่มี step ถัดไป → อัปเดตสถานะ leaveRequest เป็น APPROVED
      await prisma.leaveRequest.update({
        where: { id: requestId },
        data: { status: "APPROVED" },
      });

      // หัก leaveBalance
      const leaveDays = leaveRequest.leavedDays ?? 0;
      await LeaveBalanceService.finalizeLeaveBalance(
        leaveRequest.userId,
        leaveRequest.leaveTypeId,
        leaveDays
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
  //  ใช้สำหรับ updateRequestStatus
  // ────────────────────────────────

  // ฟังก์ชันสำหรับดึง approver คนถัดไป
  static async getNextApprover(stepOrder) {
    const approvers = {
      2: await UserService.getVerifier(),
      3: await UserService.getReceiver(),
      4: await UserService.getApprover2(),
      5: await UserService.getApprover3(),
      6: await UserService.getApprover4(),
    };
    return approvers[stepOrder] || null;
  }

  // ────────────────────────────────
  // ❌ DELETE
  // ────────────────────────────────

  static async deleteRequest(requestId) {
    const request = await prisma.leaveRequest.findUnique({
      where: { id: requestId },
    });
    if (!request) return null;
    if (request.status !== "PENDING")
      throw createError(400, "ไม่สามารถลบคำขอที่อนุมัติหรือปฏิเสธแล้วได้");
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

    const leaveTypeIdInt = parseInt(leaveTypeId);
    if (isNaN(leaveTypeIdInt)) throw createError(400, "leaveTypeId ไม่ถูกต้อง");
    const rank = await RankService.getRankForUserByLeaveType(
      user,
      leaveTypeIdInt
    );

    if (!rank) {
      return {
        success: false,
        message: "ยังไม่มีสิทธิ์ลาพักผ่อนในช่วงอายุงานปัจจุบัน!",
      };
    }

    if (requestedDays > rank.receiveDays) {
      return {
        success: false,
        message: `จำนวนวันที่ลาขอเกินสิทธิ์ที่กำหนด (${rank.receiveDays} วัน)`,
      };
    }

    const balance = await prisma.leaveBalance.findFirst({
      where: {
        userId,
        leaveTypeId: parseInt(leaveTypeId),
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

  // get all leaveRequest
  static async getAllRequests() {
    return await prisma.leaveRequest.findMany({
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
                name: true,
              },
            },
          },
        },
        leaveType: true,
      },
      orderBy: { createdAt: "desc" },
    });
  }

  // ────────────────────────────────
  // 🟢 GET REQUEST FOR APPROVER
  // ────────────────────────────────

  static async getPendingRequestsByFirstApprover(headId) {
    return await prisma.leaveRequest.findMany({
      where: {
        status: "PENDING",
        user: {
          department: {
            headId: headId,
          },
        },
        leaveRequestDetails: {
          some: {
            stepOrder: 1,
            status: "PENDING",
          },
        },
      },
      include: {
        user: {
          select: {
            id: true,
            prefixName: true,
            firstName: true,
            lastName: true,
            department: {
              select: {
                name: true,
              },
            },
          },
        },
        leaveType: true,
        leaveRequestDetails: {
          where: {
            stepOrder: 1,
          },
        },
        files: true,
      },
    });
  }

  static async getPendingRequestsByVerifier() {
    return await prisma.leaveRequest.findMany({
      where: {
        status: "PENDING",
        leaveRequestDetails: {
          some: {
            stepOrder: 2,
            status: "PENDING",
          },
        },
      },
      include: {
        user: {
          select: {
            id: true,
            prefixName: true,
            firstName: true,
            lastName: true,
            department: {
              select: {
                name: true,
              },
            },
          },
        },
        leaveType: true,
        leaveRequestDetails: {
          where: {
            stepOrder: 2,
          },
        },
        files: true,
      },
    });
  }

  static async getPendingRequestsByReceiver() {
    return await prisma.leaveRequest.findMany({
      where: {
        status: "PENDING",
        leaveRequestDetails: {
          some: {
            stepOrder: 3,
            status: "PENDING",
          },
        },
      },
      include: {
        user: {
          select: {
            id: true,
            prefixName: true,
            firstName: true,
            lastName: true,
            department: {
              select: {
                name: true,
              },
            },
          },
        },
        leaveType: true,
        leaveRequestDetails: {
          where: {
            stepOrder: 3,
          },
        },
        files: true,
      },
    });
  }

  static async getPendingRequestsBySecondApprover() {
    return await prisma.leaveRequest.findMany({
      where: {
        status: "PENDING",
        leaveRequestDetails: {
          some: {
            stepOrder: 4,
            status: "PENDING",
          },
        },
      },
      include: {
        user: {
          select: {
            id: true,
            prefixName: true,
            firstName: true,
            lastName: true,
            department: {
              select: {
                name: true,
              },
            },
          },
        },
        leaveType: true,
        leaveRequestDetails: {
          where: {
            stepOrder: 4,
          },
        },
        files: true,
      },
    });
  }

  static async getPendingRequestsByThirdApprover() {
    return await prisma.leaveRequest.findMany({
      where: {
        status: "PENDING",
        leaveRequestDetails: {
          some: {
            stepOrder: 5,
            status: "PENDING",
          },
        },
      },
      include: {
        user: {
          select: {
            id: true,
            prefixName: true,
            firstName: true,
            lastName: true,
            department: {
              select: {
                name: true,
              },
            },
          },
        },
        leaveType: true,
        leaveRequestDetails: {
          where: {
            stepOrder: 5,
          },
        },
        files: true,
      },
    });
  }

  static async getPendingRequestsByFourthApprover() {
    return await prisma.leaveRequest.findMany({
      where: {
        status: "PENDING",
        leaveRequestDetails: {
          some: {
            stepOrder: 6,
            status: "PENDING",
          },
        },
      },
      include: {
        user: {
          select: {
            id: true,
            prefixName: true,
            firstName: true,
            lastName: true,
            department: {
              select: {
                name: true,
              },
            },
          },
        },
        leaveType: true,
        leaveRequestDetails: {
          where: {
            stepOrder: 6,
          },
        },
        files: true,
      },
    });
  }

  // ────────────────────────────────────────────────────────────────
  // 🟢      APPROVED AND REJECTED (version split approver)
  // ────────────────────────────────────────────────────────────────

  // ──────────────────────────────────────────
  // 🟢   Approver 1: Head of Department
  // ──────────────────────────────────────────

  static async approveByFirstApprover({ id, approverId, remarks, comment }) {
    // 1. ตรวจสอบว่า leaveRequestDetail นี้มีอยู่หรือไม่
    const existingDetail = await prisma.leaveRequestDetail.findUnique({
      where: { id: Number(id) },
    });

    if (!existingDetail) throw createError(404, "ไม่พบรายการคำขอลา");

    // ตรวจสอบสถานะว่าต้องเป็น PENDING เท่านั้น
    if (existingDetail.status !== "PENDING") {
      throw createError(
        400,
        "รายการคำขอนี้ไม่อยู่ในสถานะรอดำเนินการ (PENDING)"
      );
    }

    // 2. อัปเดตรายการคำขอลา
    const updatedDetail = await prisma.leaveRequestDetail.update({
      where: { id: Number(id) },
      data: {
        approverId,
        status: "APPROVED",
        reviewedAt: new Date(),
        remarks,
        comment,
      },
      include: {
        leaveRequest: true,
      },
    });

    // บันทึก log การทำงาน
    await AuditLogService.createLog(
      approverId,
      `Update Status`,
      updatedDetail.leaveRequestId,
      `Step 1 → APPROVED${remarks ? `(${remarks})` : ""}`,
      "APPROVED"
    );

    // 3. หา verifier user
    const verifier = await prisma.userRole.findFirst({
      where: {
        role: { name: "VERIFIER" },
      },
      orderBy: { id: "asc" },
    });

    if (!verifier) throw createError(404, "ไม่พบผู้ตรวจสอบ (VERIFIER)");

    // 4. สร้าง LeaveRequestDetail ใหม่สำหรับ verifier
    const newDetail = await prisma.leaveRequestDetail.create({
      data: {
        approverId: verifier.userId,
        leaveRequestId: updatedDetail.leaveRequestId,
        stepOrder: 2,
        status: "PENDING",
      },
    });

    // 5. ส่งอีเมลแจ้งเตือนให้ verifier
    const verifierUser = await prisma.user.findUnique({
      where: { id: verifier.userId },
      select: {
        email: true,
        prefixName: true,
        firstName: true,
        lastName: true,
      },
    });

    if (verifierUser.email) {
      await sendNotification("APPROVER1_APPROVED", {
        to: verifierUser.email,
        userName: `${verifierUser.prefixName} ${verifierUser.firstName} ${verifierUser.lastName}`,
      });
    }

    // 6. ส่งอีเมลแจ้งเตือนให้ผู้ขออนุมัติ
    const requester = await prisma.user.findUnique({
      where: { id: updatedDetail.leaveRequest.userId },
      select: {
        email: true,
        prefixName: true,
        firstName: true,
        lastName: true,
      },
    });

    if (requester.email) {
      await sendNotification("STEP_APPROVER1", {
        to: requester.email,
        userName: `${requester.prefixName} ${requester.firstName} ${requester.lastName}`,
      });
    }

    return {
      message: "อนุมัติเรียบร้อย และส่งต่อให้ผู้ตรวจสอบ",
      approvedDetail: updatedDetail,
      nextStepDetail: newDetail,
    };
  }

  static async rejectByFirstApprover({ id, approverId, remarks, comment }) {
    // 1. ตรวจสอบว่า LeaveRequestDetail นี้มีอยู่หรือไม่
    const existingDetail = await prisma.leaveRequestDetail.findUnique({
      where: { id: Number(id) },
    });

    if (!existingDetail) throw createError(404, "ไม่พบรายการคำขอลา");

    // ตรวจสอบสถานะว่าต้องเป็น PENDING เท่านั้น
    if (existingDetail.status !== "PENDING") {
      throw createError(
        400,
        "รายการคำขอนี้ไม่อยู่ในสถานะรอดำเนินการ (PENDING)"
      );
    }

    // 2. อัปเดตรายการคำขอลา
    const updatedDetail = await prisma.leaveRequestDetail.update({
      where: { id: Number(id) },
      data: {
        approverId,
        status: "REJECTED", // เปลี่ยนสถานะเป็น REJECTED
        reviewedAt: new Date(), // อัปเดตเวลา
        remarks,
        comment,
      },
      include: {
        leaveRequest: true,
      },
    });

    await prisma.LeaveRequest.update({
      where: { id: updatedDetail.leaveRequestId },
      data: {
        status: "REJECTED",
      },
    });

    // บันทึก log การทำงาน
    await AuditLogService.createLog(
      approverId,
      `Update Status`,
      updatedDetail.leaveRequestId,
      `Step 1 → REJECTED${remarks ? `(${remarks})` : ""}`,
      "REJECTED"
    );

    // 3. ส่งอีเมลแจ้งเตือนให้ผู้ขออนุมัติ
    const requester = await prisma.user.findUnique({
      where: { id: updatedDetail.leaveRequest.userId },
      select: {
        email: true,
        prefixName: true,
        firstName: true,
        lastName: true,
      },
    });

    if (requester.email) {
      await sendNotification("REJECTION", {
        to: requester.email,
        userName: `${requester.prefixName} ${requester.firstName} ${requester.lastName}`,
        remarks,
      });
    }

    return {
      message: "รายการคำขอลาถูกปฏิเสธเรียบร้อย",
      rejectedDetail: updatedDetail,
    };
  }

  // ──────────────────────────────────────────
  // 🟢   Verifier: Verifier of Faculty
  // ──────────────────────────────────────────

  static async approveByVerifier({ id, approverId, remarks, comment }) {
    // 1. ตรวจสอบว่า leaveRequestDetail นี้มีอยู่หรือไม่
    const existingDetail = await prisma.leaveRequestDetail.findFirst({
      where: {
        id: Number(id),
        stepOrder: 2,
      },
    });
    if (!existingDetail) throw createError(404, "ไม่พบรายการคำขอลา");

    // ตรวจสอบสถานะว่าต้องเป็น PENDING เท่านั้น
    if (existingDetail.status !== "PENDING") {
      throw createError(
        400,
        "รายการคำขอนี้ไม่อยู่ในสถานะรอดำเนินการ (PENDING)"
      );
    }

    // 2. อัปเดตรายการคำขอลา
    const updatedDetail = await prisma.leaveRequestDetail.update({
      where: { id: Number(id) },
      data: {
        approverId,
        status: "APPROVED",
        reviewedAt: new Date(),
        remarks,
        comment,
      },
      include: {
        leaveRequest: true,
      },
    });

    // บันทึก log การทำงาน
    await AuditLogService.createLog(
      approverId,
      `Update Status`,
      updatedDetail.leaveRequestId,
      `Step 2 → APPROVED${remarks ? `(${remarks})` : ""}`,
      "APPROVED"
    );

    // 3. หา receiver user
    const receiver = await prisma.userRole.findFirst({
      where: {
        role: { name: "RECEIVER" },
      },
      orderBy: { id: "asc" },
    });

    if (!receiver) throw createError(404, "ไม่พบผู้ตรวจสอบ (RECEIVER)");

    // 4. สร้าง LeaveRequestDetail ใหม่สำหรับ receiver
    const newDetail = await prisma.leaveRequestDetail.create({
      data: {
        approverId: receiver.userId,
        leaveRequestId: updatedDetail.leaveRequestId,
        stepOrder: 3,
        status: "PENDING",
      },
    });

    // 5. ส่งอีเมลแจ้งเตือนให้ Receiver
    const receiverUser = await prisma.user.findUnique({
      where: { id: receiver.userId },
      select: {
        email: true,
        prefixName: true,
        firstName: true,
        lastName: true,
      },
    });

    if (receiverUser.email) {
      await sendNotification("VERIFIER_APPROVED", {
        to: receiverUser.email,
        userName: `${receiverUser.prefixName} ${receiverUser.firstName} ${receiverUser.lastName}`,
      });
    }

    // 6. ส่งอีเมลแจ้งเตือนให้ผู้ขออนุมัติ
    const requester = await prisma.user.findUnique({
      where: { id: updatedDetail.leaveRequest.userId },
      select: {
        email: true,
        prefixName: true,
        firstName: true,
        lastName: true,
      },
    });

    if (requester.email) {
      await sendNotification("STEP_APPROVED_2", {
        to: requester.email,
        userName: `${requester.prefixName} ${requester.firstName} ${requester.lastName}`,
      });
    }

    return {
      message: "อนุมัติเรียบร้อย และส่งต่อให้ผู้รับหนังสือ",
      approvedDetail: updatedDetail,
      nextStepDetail: newDetail,
    };
  }

  static async rejectByVerifier({ id, approverId, remarks, comment }) {
    // 1. ตรวจสอบว่า leaveRequestDetail นี้มีอยู่หรือไม่
    const existingDetail = await prisma.leaveRequestDetail.findFirst({
      where: {
        id: Number(id),
        stepOrder: 2,
      },
    });
    if (!existingDetail) throw createError(404, "ไม่พบรายการคำขอลา");

    // ตรวจสอบสถานะว่าต้องเป็น PENDING เท่านั้น
    if (existingDetail.status !== "PENDING") {
      throw createError(
        400,
        "รายการคำขอนี้ไม่อยู่ในสถานะรอดำเนินการ (PENDING)"
      );
    }

    // 2. อัปเดตรายการคำขอลา
    const updatedDetail = await prisma.leaveRequestDetail.update({
      where: { id: Number(id) },
      data: {
        approverId,
        status: "REJECTED", // เปลี่ยนสถานะเป็น REJECTED
        reviewedAt: new Date(), // อัปเดตเวลา
        remarks,
        comment,
      },
      include: {
        leaveRequest: true,
      },
    });

    await prisma.LeaveRequest.update({
      where: { id: updatedDetail.leaveRequestId },
      data: {
        status: "REJECTED",
      },
    });

    // บันทึก log การทำงาน
    await AuditLogService.createLog(
      approverId,
      `Update Status`,
      updatedDetail.leaveRequestId,
      `Step 2 → REJECTED${remarks ? `(${remarks})` : ""}`,
      "REJECTED"
    );

    // ส่งอีเมลแจ้งเตือนให้ผู้ขออนุมัติ
    const requester = await prisma.user.findUnique({
      where: { id: updatedDetail.leaveRequest.userId },
      select: {
        email: true,
        prefixName: true,
        firstName: true,
        lastName: true,
      },
    });

    if (requester.email) {
      await sendNotification("REJECTED", {
        to: requester.email,
        userName: `${requester.prefixName} ${requester.firstName} ${requester.lastName}`,
        remarks,
      });
    }

    return {
      message: "รายการคำขอลาถูกปฏิเสธเรียบร้อย",
      rejectedDetail: updatedDetail,
    };
  }

  // ──────────────────────────────────────────
  // 🟢   Receiver: Receiver of Faculty
  // ──────────────────────────────────────────

  static async approveByReceiver({
    id,
    approverId,
    remarks,
    comment,
    documentNumber,
  }) {
    // 1. ตรวจสอบว่า leaveRequestDetail นี้มีอยู่หรือไม่
    const existingDetail = await prisma.leaveRequestDetail.findFirst({
      where: {
        id: Number(id),
        stepOrder: 3,
      },
    });
    if (!existingDetail) throw createError(404, "ไม่พบรายการคำขอลา");

    // ตรวจสอบสถานะว่าต้องเป็น PENDING เท่านั้น
    if (existingDetail.status !== "PENDING") {
      throw createError(
        400,
        "รายการคำขอนี้ไม่อยู่ในสถานะรอดำเนินการ (PENDING)"
      );
    }

    // 2. อัปเดตรายการคำขอลา
    const updatedDetail = await prisma.leaveRequestDetail.update({
      where: { id: Number(id) },
      data: {
        approverId,
        status: "APPROVED",
        reviewedAt: new Date(),
        remarks,
        comment,
      },
      include: {
        leaveRequest: true,
      },
    });

    // บันทึก log การทำงาน
    await AuditLogService.createLog(
      approverId,
      `Update Status`,
      updatedDetail.leaveRequestId,
      `Step 3 → APPROVED${remarks ? `(${remarks})` : ""}`,
      "APPROVED"
    );

    // ถ้าเป็น receiver จะทำการอัปเดตเลขที่เอกสาร

    await prisma.leaveRequest.update({
      where: { id: updatedDetail.leaveRequestId },
      data: {
        documentNumber,
        documentIssuedDate: new Date(),
      },
    });

    // 3. หา APPROVER_2
    const approver = await prisma.userRole.findFirst({
      where: {
        role: { name: "APPROVER_2" },
      },
      orderBy: { id: "asc" },
    });

    if (!approver) throw createError(404, "ไม่พบผู้อณุมัติ (APPROVER_2)");

    // 4. สร้าง LeaveRequestDetail ใหม่สำหรับ approver
    const newDetail = await prisma.leaveRequestDetail.create({
      data: {
        approverId: approver.userId,
        leaveRequestId: updatedDetail.leaveRequestId,
        stepOrder: 4,
        status: "PENDING",
      },
    });

    // 5. ส่งอีเมลแจ้งเตือนให้ APPROVER_2
    const approverUser = await prisma.user.findUnique({
      where: { id: approver.userId },
      select: {
        email: true,
        prefixName: true,
        firstName: true,
        lastName: true,
      },
    });

    if (approverUser.email) {
      await sendNotification("RECEIVER_ISSUED", {
        to: approverUser.email,
        userName: `${approverUser.prefixName} ${approverUser.firstName} ${approverUser.lastName}`,
      });
    }

    // 6. ส่งอีเมลแจ้งเตือนให้ผู้ขออนุมัติ
    const requester = await prisma.user.findUnique({
      where: { id: updatedDetail.leaveRequest.userId },
      select: {
        email: true,
        prefixName: true,
        firstName: true,
        lastName: true,
      },
    });

    if (requester.email) {
      await sendNotification("STEP_RECEIVER", {
        to: requester.email,
        userName: `${requester.prefixName} ${requester.firstName} ${requester.lastName}`,
      });
    }

    return {
      message: "อนุมัติเรียบร้อย และส่งต่อให้ผู้รับหนัวสือ",
      approvedDetail: updatedDetail,
      nextStepDetail: newDetail,
    };
  }

  static async rejectByReceiver({ id, approverId, remarks, comment }) {
    // 1. ตรวจสอบว่า leaveRequestDetail นี้มีอยู่หรือไม่
    const existingDetail = await prisma.leaveRequestDetail.findFirst({
      where: {
        id: Number(id),
        stepOrder: 3,
      },
    });
    if (!existingDetail) throw createError(404, "ไม่พบรายการคำขอลา");

    // ตรวจสอบสถานะว่าต้องเป็น PENDING เท่านั้น
    if (existingDetail.status !== "PENDING") {
      throw createError(
        400,
        "รายการคำขอนี้ไม่อยู่ในสถานะรอดำเนินการ (PENDING)"
      );
    }

    // 2. อัปเดตรายการคำขอลา
    const updatedDetail = await prisma.leaveRequestDetail.update({
      where: { id: Number(id) },
      data: {
        approverId,
        status: "REJECTED", // เปลี่ยนสถานะเป็น REJECTED
        reviewedAt: new Date(), // อัปเดตเวลา
        remarks,
        comment,
      },
      include: {
        leaveRequest: true,
      },
    });

    // บันทึก log การทำงาน
    await AuditLogService.createLog(
      approverId,
      `Update Status`,
      updatedDetail.leaveRequestId,
      `Step 3 → REJECTED${remarks ? `(${remarks})` : ""}`,
      "REJECTED"
    );

    // ส่งอีเมลแจ้งเตือนให้ผู้ขออนุมัติ
    const requester = await prisma.user.findUnique({
      where: { id: updatedDetail.leaveRequest.userId },
      select: {
        email: true,
        prefixName: true,
        firstName: true,
        lastName: true,
      },
    });

    if (requester.email) {
      await sendNotification("REJECTED", {
        to: requester.email,
        userName: `${requester.prefixName} ${requester.firstName} ${requester.lastName}`,
        remarks,
      });
    }

    return {
      message: "รายการคำขอลาถูกปฏิเสธเรียบร้อย",
      rejectedDetail: updatedDetail,
    };
  }

  // ──────────────────────────────────────────
  // 🟢   Approver 2: Head of Faculty
  // ──────────────────────────────────────────

  static async approveBySecondApprover({ id, approverId, remarks, comment }) {
    // 1. ตรวจสอบว่า leaveRequestDetail นี้มีอยู่หรือไม่
    const existingDetail = await prisma.leaveRequestDetail.findFirst({
      where: {
        id: Number(id),
        stepOrder: 4,
      },
    });
    if (!existingDetail) throw createError(404, "ไม่พบรายการคำขอลา");

    // ตรวจสอบสถานะว่าต้องเป็น PENDING เท่านั้น
    if (existingDetail.status !== "PENDING") {
      throw createError(
        400,
        "รายการคำขอนี้ไม่อยู่ในสถานะรอดำเนินการ (PENDING)"
      );
    }

    // 2. อัปเดตรายการคำขอลา
    const updatedDetail = await prisma.leaveRequestDetail.update({
      where: { id: Number(id) },
      data: {
        approverId,
        status: "APPROVED",
        reviewedAt: new Date(),
        remarks,
        comment,
      },
      include: {
        leaveRequest: true,
      },
    });

    // บันทึก log การทำงาน
    await AuditLogService.createLog(
      approverId,
      `Update Status`,
      updatedDetail.leaveRequestId,
      `Step 4 → APPROVED${remarks ? `(${remarks})` : ""}`,
      "APPROVED"
    );

    // 3. หา approver user
    const approver = await prisma.UserRole.findFirst({
      where: {
        role: { name: "APPROVER_3" },
      },
      orderBy: { id: "asc" },
    });

    if (!approver) throw createError(404, "ไม่พบผู้อนุมัติ (APPROVER_3)");

    // 4. สร้าง LeaveRequestDetail ใหม่สำหรับ APPROVER_3
    const newDetail = await prisma.leaveRequestDetail.create({
      data: {
        approverId: approver.userId,
        leaveRequestId: updatedDetail.leaveRequestId,
        stepOrder: 5,
        status: "PENDING",
      },
    });

    // 5. ส่งอีเมลแจ้งเตือนให้ APPROVER_3
    const approverUser = await prisma.user.findUnique({
      where: { id: approver.userId },
      select: {
        email: true,
        prefixName: true,
        firstName: true,
        lastName: true,
      },
    });

    if (approverUser.email) {
      await sendNotification("APPROVER2_APPROVED", {
        to: approverUser.email,
        userName: `${approverUser.prefixName} ${approverUser.firstName} ${approverUser.lastName}`,
      });
    }

    // 6. ส่งอีเมลแจ้งเตือนให้ผู้ขออนุมัติ
    const requester = await prisma.user.findUnique({
      where: { id: updatedDetail.leaveRequest.userId },
      select: {
        email: true,
        prefixName: true,
        firstName: true,
        lastName: true,
      },
    });

    if (requester.email) {
      await sendNotification("STEP_APPROVER3", {
        to: requester.email,
        userName: `${requester.prefixName} ${requester.firstName} ${requester.lastName}`,
      });
    }

    return {
      message: "อนุมัติเรียบร้อย และส่งต่อให้ผู้รับหนัวสือ",
      approvedDetail: updatedDetail,
      nextStepDetail: newDetail,
    };
  }

  static async rejectBySecondApprover({ id, approverId, remarks, comment }) {
    // 1. ตรวจสอบว่า leaveRequestDetail นี้มีอยู่หรือไม่
    const existingDetail = await prisma.leaveRequestDetail.findFirst({
      where: {
        id: Number(id),
        stepOrder: 4,
      },
    });
    if (!existingDetail) throw createError(404, "ไม่พบรายการคำขอลา");

    // ตรวจสอบสถานะว่าต้องเป็น PENDING เท่านั้น
    if (existingDetail.status !== "PENDING") {
      throw createError(
        400,
        "รายการคำขอนี้ไม่อยู่ในสถานะรอดำเนินการ (PENDING)"
      );
    }

    // 2. อัปเดตรายการคำขอลา
    const updatedDetail = await prisma.leaveRequestDetail.update({
      where: { id: Number(id) },
      data: {
        approverId,
        status: "REJECTED", // เปลี่ยนสถานะเป็น REJECTED
        reviewedAt: new Date(), // อัปเดตเวลา
        remarks,
        comment,
      },
      include: {
        leaveRequest: true,
      },
    });

    await prisma.LeaveRequest.update({
      where: { id: updatedDetail.leaveRequestId },
      data: {
        status: "REJECTED",
      },
    });

    // บันทึก log การทำงาน
    await AuditLogService.createLog(
      approverId,
      `Update Status`,
      updatedDetail.leaveRequestId,
      `Step 4 → REJECTED${remarks ? `(${remarks})` : ""}`,
      "REJECTED"
    );

    // ส่งอีเมลแจ้งเตือนให้ผู้ขออนุมัติ
    const requester = await prisma.user.findUnique({
      where: { id: updatedDetail.leaveRequest.userId },
      select: {
        email: true,
        prefixName: true,
        firstName: true,
        lastName: true,
      },
    });

    if (requester.email) {
      await sendNotification("REJECTED", {
        to: requester.email,
        userName: `${requester.prefixName} ${requester.firstName} ${requester.lastName}`,
        remarks,
      });
    }

    return {
      message: "รายการคำขอลาถูกปฏิเสธเรียบร้อย",
      rejectedDetail: updatedDetail,
    };
  }

  // ──────────────────────────────────────────
  // 🟢   Approver 3: Assistant to Dean
  // ──────────────────────────────────────────

  static async approveByThirdApprover({ id, approverId, remarks, comment }) {
    // 1. ตรวจสอบว่า leaveRequestDetail นี้มีอยู่หรือไม่
    const existingDetail = await prisma.leaveRequestDetail.findFirst({
      where: {
        id: Number(id),
        stepOrder: 5,
      },
    });
    if (!existingDetail) throw createError(404, "ไม่พบรายการคำขอลา");

    // ตรวจสอบสถานะว่าต้องเป็น PENDING เท่านั้น
    if (existingDetail.status !== "PENDING") {
      throw createError(
        400,
        "รายการคำขอนี้ไม่อยู่ในสถานะรอดำเนินการ (PENDING)"
      );
    }

    // 2. อัปเดตรายการคำขอลา
    const updatedDetail = await prisma.leaveRequestDetail.update({
      where: { id: Number(id) },
      data: {
        approverId,
        status: "APPROVED",
        reviewedAt: new Date(),
        remarks,
        comment,
      },
      include: {
        leaveRequest: true,
      },
    });

    // บันทึก log การทำงาน
    await AuditLogService.createLog(
      approverId,
      `Update Status`,
      updatedDetail.leaveRequestId,
      `Step 5 → APPROVED${remarks ? `(${remarks})` : ""}`,
      "APPROVED"
    );

    // 3. หา approver user
    const approver = await prisma.userRole.findFirst({
      where: {
        role: { name: "APPROVER_4" },
      },
      orderBy: { id: "asc" },
    });

    if (!approver) throw createError(404, "ไม่พบผู้อนุมัติ (APPROVER_4)");

    // 4. สร้าง LeaveRequestDetail ใหม่สำหรับ APPROVER_4
    const newDetail = await prisma.leaveRequestDetail.create({
      data: {
        approverId: approver.userId,
        leaveRequestId: updatedDetail.leaveRequestId,
        stepOrder: 6,
        status: "PENDING",
      },
    });

    // 5. ส่งอีเมลแจ้งเตือนให้ APPROVER_4
    const approverUser = await prisma.user.findUnique({
      where: { id: approver.userId },
      select: {
        email: true,
        prefixName: true,
        firstName: true,
        lastName: true,
      },
    });

    if (approverUser.email) {
      await sendNotification("APPROVER3_APPROVED", {
        to: approverUser.email,
        userName: `${approverUser.prefixName} ${approverUser.firstName} ${approverUser.lastName}`,
      });
    }

    // 6. ส่งอีเมลแจ้งเตือนให้ผู้ขออนุมัติ
    const requester = await prisma.user.findUnique({
      where: { id: updatedDetail.leaveRequest.userId },
      select: {
        email: true,
        prefixName: true,
        firstName: true,
        lastName: true,
      },
    });

    if (requester.email) {
      await sendNotification("STEP_APPROVER4", {
        to: requester.email,
        userName: `${requester.prefixName} ${requester.firstName} ${requester.lastName}`,
      });
    }

    return {
      message: "อนุมัติเรียบร้อย และส่งต่อให้ผู้รับหนัวสือ",
      approvedDetail: updatedDetail,
      nextStepDetail: newDetail,
    };
  }

  static async rejectByThirdApprover({ id, approverId, remarks, comment }) {
    // 1. ตรวจสอบว่า leaveRequestDetail นี้มีอยู่หรือไม่
    const existingDetail = await prisma.leaveRequestDetail.findFirst({
      where: {
        id: Number(id),
        stepOrder: 5,
      },
    });
    if (!existingDetail) throw createError(404, "ไม่พบรายการคำขอลา");

    // ตรวจสอบสถานะว่าต้องเป็น PENDING เท่านั้น
    if (existingDetail.status !== "PENDING") {
      throw createError(
        400,
        "รายการคำขอนี้ไม่อยู่ในสถานะรอดำเนินการ (PENDING)"
      );
    }

    // 2. อัปเดตรายการคำขอลา
    const updatedDetail = await prisma.leaveRequestDetail.update({
      where: { id: Number(id) },
      data: {
        approverId,
        status: "REJECTED", // เปลี่ยนสถานะเป็น REJECTED
        reviewedAt: new Date(), // อัปเดตเวลา
        remarks,
        comment,
      },
      include: {
        leaveRequest: true,
      },
    });

    await prisma.LeaveRequest.update({
      where: { id: updatedDetail.leaveRequestId },
      data: {
        status: "REJECTED",
      },
    });

    // บันทึก log การทำงาน
    await AuditLogService.createLog(
      approverId,
      `Update Status`,
      updatedDetail.leaveRequestId,
      `Step 5 → REJECTED${remarks ? `(${remarks})` : ""}`,
      "REJECTED"
    );

    // ส่งอีเมลแจ้งเตือนให้ผู้ขออนุมัติ
    const requester = await prisma.user.findUnique({
      where: { id: updatedDetail.leaveRequest.userId },
      select: {
        email: true,
        prefixName: true,
        firstName: true,
        lastName: true,
      },
    });

    if (requester.email) {
      await sendNotification("REJECTED", {
        to: requester.email,
        userName: `${requester.prefixName} ${requester.firstName} ${requester.lastName}`,
        remarks,
      });
    }

    return {
      message: "รายการคำขอลาถูกปฏิเสธเรียบร้อย",
      rejectedDetail: updatedDetail,
    };
  }

  // ──────────────────────────────────────────
  // 🟢   Approver 4: The Last of Approver
  // ──────────────────────────────────────────

  static async approveByFourthApprover({ id, approverId, remarks, comment }) {
    // 1. ตรวจสอบว่า leaveRequestDetail นี้มีอยู่หรือไม่
    const existingDetail = await prisma.leaveRequestDetail.findFirst({
      where: {
        id: Number(id),
        stepOrder: 6,
      },
    });
    if (!existingDetail) throw createError(404, "ไม่พบรายการคำขอลา");

    // ตรวจสอบสถานะว่าต้องเป็น PENDING เท่านั้น
    if (existingDetail.status !== "PENDING") {
      throw createError(
        400,
        "รายการคำขอนี้ไม่อยู่ในสถานะรอดำเนินการ (PENDING)"
      );
    }

    // 2. อัปเดตรายการคำขอลา
    const updatedDetail = await prisma.leaveRequestDetail.update({
      where: { id: Number(id) },
      data: {
        approverId,
        status: "APPROVED",
        reviewedAt: new Date(),
        remarks,
        comment,
      },
      include: {
        leaveRequest: true,
      },
    });

    // บันทึก log การทำงาน
    await AuditLogService.createLog(
      approverId,
      `Update Status`,
      updatedDetail.leaveRequestId,
      `Step 6 → APPROVED${remarks ? `(${remarks})` : ""}`,
      "APPROVED"
    );

    await prisma.leaveRequest.update({
      where: { id: updatedDetail.leaveRequestId },
      data: {
        status: "APPROVED",
      },
    });

    const request = await prisma.leaveRequest.findUnique({
      where: { id: updatedDetail.leaveRequestId },
      include: {
        user: true,
        leaveType: true,
        leaveRequestDetails: true,
      },
    });

    if (!request) throw createError(404, "ไม่พบคำขอลา");

    await LeaveBalanceService.finalizeLeaveBalance(
      request.userId,
      request.leaveTypeId,
      request.thisTimeDays
    );

    // 5. ส่งอีเมลแจ้งเตือนให้ ผู้ขออนุมัติ
    const requester = await prisma.user.findUnique({
      where: { id: updatedDetail.leaveRequest.userId },
      select: {
        email: true,
        prefixName: true,
        firstName: true,
        lastName: true,
      },
    });

    if (requester.email) {
      await sendNotification("FULLY_APPROVED", {
        to: requester.email,
        userName: `${requester.prefixName} ${requester.firstName} ${requester.lastName}`,
      });
    }

    return {
      message: "อนุมัติเรียบร้อย และส่งต่อให้ผู้รับหนังสือ",
      approvedDetail: updatedDetail,
    };
  }

  static async rejectByFourthApprover({ id, approverId, remarks, comment }) {
    // 1. ตรวจสอบว่า leaveRequestDetail นี้มีอยู่หรือไม่
    const existingDetail = await prisma.leaveRequestDetail.findFirst({
      where: {
        id: Number(id),
        stepOrder: 6,
      },
    });
    if (!existingDetail) throw createError(404, "ไม่พบรายการคำขอลา");

    // ตรวจสอบสถานะว่าต้องเป็น PENDING เท่านั้น
    if (existingDetail.status !== "PENDING") {
      throw createError(
        400,
        "รายการคำขอนี้ไม่อยู่ในสถานะรอดำเนินการ (PENDING)"
      );
    }

    // 2. อัปเดตรายการคำขอลา
    const updatedDetail = await prisma.leaveRequestDetail.update({
      where: { id: Number(id) },
      data: {
        approverId,
        status: "REJECTED", // เปลี่ยนสถานะเป็น REJECTED
        reviewedAt: new Date(), // อัปเดตเวลา
        remarks,
        comment,
      },
      include: {
        leaveRequest: true,
      },
    });

    await prisma.LeaveRequest.update({
      where: { id: updatedDetail.leaveRequestId },
      data: {
        status: "REJECTED",
      },
    });

    // บันทึก log การทำงาน
    await AuditLogService.createLog(
      approverId,
      `Update Status`,
      updatedDetail.leaveRequestId,
      `Step 6 → REJECTED${remarks ? `(${remarks})` : ""}`,
      "REJECTED"
    );

    // ส่งอีเมลแจ้งเตือนให้ผู้ขออนุมัติ
    const requester = await prisma.user.findUnique({
      where: { id: updatedDetail.leaveRequest.userId },
      select: {
        email: true,
        prefixName: true,
        firstName: true,
        lastName: true,
      },
    });

    if (requester.email) {
      await sendNotification("REJECTED", {
        to: requester.email,
        userName: `${requester.prefixName} ${requester.firstName} ${requester.lastName}`,
        remarks,
      });
    }

    return {
      message: "รายการคำขอลาถูกปฏิเสธเรียบร้อย",
      rejectedDetail: updatedDetail,
    };
  }

  // ────────────────────────────────
  // 🟢 GET REQUEST By ID (backup)
  // ────────────────────────────────

  // static async getRequestsById(requestId) {
  //   return await prisma.LeaveRequest.findMany({
  //     where: { id: Number(requestId) },
  //     include: {
  //       user: {
  //         select: {
  //           id: true,
  //           prefixName: true,
  //           firstName: true,
  //           lastName: true,
  //         },
  //       },
  //       leaveType: true,
  //       leaveRequestDetails: true,
  //       files: true,
  //     },
  //   });
  // }
}

module.exports = LeaveRequestService;
