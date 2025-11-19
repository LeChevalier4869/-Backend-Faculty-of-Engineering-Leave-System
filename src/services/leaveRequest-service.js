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

    // validation
    if (!userId || !leaveTypeId || !startDate || !endDate) {
      throw createError(400, "ข้อมูลไม่ครบถ้วน");
    }

    const start = new Date(startDate);
    const end = new Date(endDate);

    if (isNaN(start) || isNaN(end)) throw createError(400, "รูปแบบวันที่ไม่ถูกต้อง");
    if (start > end) throw createError(400, "วันที่เริ่มต้นต้องไม่มากกว่าวันที่สิ้นสุด");

    // คำนวณจำนวนวันลา
    const requestedDays = await calculateWorkingDays(start, end);
    if (typeof requestedDays !== "number" || isNaN(requestedDays) || requestedDays <= 0) {
      throw createError(400, "จำนวนวันลาต้องมากกว่า 0");
    }

    // ตรวจสอบสิทธิ์และดึง verifier พร้อมกัน (refactor)
    const [eligibility, verifier] = await Promise.all([
      this.checkEligibility(userId, leaveTypeId, requestedDays),
      UserService.getVerifier()
    ]);

    if (!eligibility.success) throw createError(400, eligibility.message);
    if (!verifier) throw createError(5001, "ไม่พบผู้ตรวจสอบในระบบ โปรดติดต่อผู้ดูแลระบบ");

    // สร้าง leaveRequest
    let leaveRequest;
    try {
      leaveRequest = await prisma.leaveRequest.create({
        data: {
          userId,
          leaveTypeId: parseInt(leaveTypeId),
          startDate: start,
          endDate: end,
          leavedDays: eligibility.balance.usedDays,
          thisTimeDays: requestedDays,
          totalDays: eligibility.balance.usedDays + requestedDays,
          balanceDays: eligibility.balance.remainingDays,
          reason,
          contact,
          verifierId: verifier.id,
          status: "PENDING",
        },
      });
    } catch (error) {
      throw createError(500, "สร้างคำขอลาไม่สำเร็จ");
    }

    // ดึง user พร้อม department
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { department: true },
    });

    if (!user) throw createError(404, "ไม่พบข้อมูลผู้ใช้งาน");
    if (!user.department || !user.department.headId) throw createError(500, "ไม่พบหัวหน้าสาขา");

    // เพิ่ม approval step แรก
    try {
      await prisma.leaveRequestDetail.create({
        data: {
          leaveRequestId: leaveRequest.id,
          approverId: user.department.headId,
          stepOrder: 1,
          status: "PENDING",
        },
      });
    } catch (error) {
      throw createError(500, "สร้าง approval step ไม่สำเร็จ");
    }
    
    // ส่งอีเมลแจ้งเตือนให้หัวหน้าสาขา
    this.notifyApprover({
      approverId: user.department.headId,
      user,
      requestedDays,
      reason,
      contact,
    }).catch(console.error); // จับ error เพื่อไม่ให้กระทบการทำงานหลัก

    // ส่งอีเมลแจ้งเตือนกลับไปยัง user ที่ยื่นคำร้อง
    this.notifyRequester({
      user,
      requestedDays,
      reason,
      contact,
    }).catch(console.error);

    return leaveRequest;
  }

  //──────────────────────────────
  // ฟังก์ชันย่อยสำหรับส่งอีเมลแจ้งเตือน (createRequest)
  //─────────────────────────────

  static async notifyApprover({ approverId, user, requestedDays, reason, contact }) {
    const approver = await UserService.getUserByIdWithRoles(approverId);
    if (!approver) return;

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

  static async notifyRequester({ user, requestedDays, reason, contact }) {
    if (!user?.email) return;
    const subject = "แจ้งเตือนการยื่นคำขอลา";
    const message = `
    <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
      <h3 style="color: #2c3e50;">เรียน ${user.prefixName} ${user.firstName} ${user.lastName},</h3>
      <p>ระบบได้รับคำขอลาของคุณเรียบร้อยแล้ว</p>
      <p><strong>รายละเอียดคำขอลา:</strong></p>
      <ul style="list-style: none; padding: 0;">
        <li><strong>จำนวนวันลา:</strong> ${requestedDays} วัน</li>
        <li><strong>เหตุผล:</strong> ${reason}</li>
        ${contact ? `<li><strong>ติดต่อ:</strong> ${contact}</li>` : ""}
      </ul>
      <p>กรุณารอการอนุมัติจากหัวหน้าสาขา</p>
      <br/>
      <p style="color: #7f8c8d;">ขอแสดงความนับถือ,</p>
      <p style="color: #7f8c8d;">ระบบจัดการวันลาคณะวิศวกรรมศาสตร์</p>
      <hr style="border: none; border-top: 1px solid #ddd; margin: 20px 0;">
      <p style="font-size: 12px; color: #95a5a6;">หมายเหตุ: อีเมลนี้เป็นการแจ้งเตือนอัตโนมัติ กรุณาอย่าตอบกลับ</p>
    </div>
  `;
    await sendEmail(user.email, subject, message);
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

  static async getLastLeaveBefore(userId, leaveTypeId, beforeDate) {
    const cutoff = new Date(beforeDate);
    if (Number.isNaN(cutoff.getTime())) throw createError(400, "beforeDate is invalid");

    return await prisma.leaveRequest.findFirst({
      where: {
        userId: Number(userId),
        leaveTypeId: Number(leaveTypeId),
        status: "APPROVED",
        startDate: { lt: cutoff },
      },
      orderBy: { startDate: "desc" },
      select: {
        id: true,
        startDate: true,
        endDate: true,
        totalDays: true,
        thisTimeDays: true,
      },
    });
  }

  static async getLastApprovedRequestIsMine(userId) {
    return await prisma.leaveRequest.findFirst({
      where: {
        userId,
        status: 'APPROVED',
      },
      orderBy: {
        createdAt: 'desc', // หรือใช้ startDate ถ้าต้องการเรียงตามวันที่เริ่มลา
      },
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

  // ────────────────────────────────
  //  ใช้สำหรับ updateRequestStatus
  // ────────────────────────────────



  // ────────────────────────────────
  // 🔒 UTIL
  // ────────────────────────────────

  static async getLeaveRequestsByUser(userId) {
    return await prisma.leaveRequest.findMany({
      where: { userId },
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
        leaveRequestDetails: {
          include: {
            approver: {
              select: {
                id: true,
                prefixName: true,
                firstName: true,
                lastName: true,
                email: true,
              },
            },
          },
          orderBy: {
            stepOrder: 'asc',
          },
        },
        files: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  static async getApprovedLeaveRequestsByUser(userId) {
    return await prisma.leaveRequest.findMany({
      where: {
        userId,
        status: "APPROVED", // ✅ แสดงเฉพาะรายการที่อนุมัติแล้ว
      },
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
        leaveRequestDetails: {
          include: {
            approver: {
              select: {
                id: true,
                prefixName: true,
                firstName: true,
                lastName: true,
                email: true,
              },
            },
          },
          orderBy: {
            stepOrder: 'asc',
          },
        },
        files: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  // ตรวจสอบสิทธิ์ลา
  static async checkEligibility(userId, leaveTypeId, requestedDays) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { personnelType: true },
    });
    if (!user) throw createError(404, "ไม่พบข้อมูลผู้ใช้งาน");

    const leaveTypeIdInt = parseInt(leaveTypeId);
    if (isNaN(leaveTypeIdInt)) throw createError(400, "leaveTypeId ไม่ถูกต้อง");
    const rank = await RankService.getRankForUserByLeaveType(
      user,
      leaveTypeIdInt
    );
    // console.log(user)
    // console.log("yyyyyyyyyyy",leaveTypeIdInt)
    // console.log("Rank:", rank); // debug

    if (!rank) {
      return {
        success: false,
        message: "ยังไม่มีสิทธิ์นี้ในช่วงอายุงานปัจจุบัน!",
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
      message: "ผ่านการตรวจสอบสิทธิ์การลา",
      rankInfo: {
        rank: rank.rank,
        receiveDays: rank.receiveDays,
        maxDays: rank.maxDays,
        isBalance: rank.isBalance,
      },
      balance,
    };
  }

  // อัปเดตเลขที่เอกสาร (not used) (backup)
  static async updateDocumentNumber(requestId, documentNumber) {
    return await prisma.leaveRequest.update({
      where: { id: requestId },
      data: {
        documentNumber,
        documentIssuedDate: new Date(),
      }
    });
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

  static async approveByVerifier({
    id,
    approverId,
    remarks,
    comment,
  }) {
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
        stepOrder: 3,
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
      await sendNotification("VERIFIER_APPROVED", {
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
      await sendNotification("STEP_APPROVED_2", {
        to: requester.email,
        userName: `${requester.prefixName} ${requester.firstName} ${requester.lastName}`,
      });
    }

    return {
      message: "อนุมัติเรียบร้อย และส่งต่อให้ผู้อนุมัติขั้นถัดไป",
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
  // 🟢   Approver 2: Head of Faculty
  // ──────────────────────────────────────────

  static async approveBySecondApprover({ id, approverId, remarks, comment }) {
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
        stepOrder: 4,
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
      message: "อนุมัติเรียบร้อย และส่งต่อให้ผู้อนุมัติขั้นถัดไป",
      approvedDetail: updatedDetail,
      nextStepDetail: newDetail,
    };
  }

  static async rejectBySecondApprover({ id, approverId, remarks, comment }) {
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
  // 🟢   Approver 3: Assistant to Dean
  // ──────────────────────────────────────────

  static async approveByThirdApprover({ id, approverId, remarks, comment }) {
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
        stepOrder: 5,
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
      message: "อนุมัติเรียบร้อย และส่งต่อให้ผู้อนุมัติขั้นถัดไป",
      approvedDetail: updatedDetail,
      nextStepDetail: newDetail,
    };
  }

  static async rejectByThirdApprover({ id, approverId, remarks, comment }) {
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
  // 🟢   Approver 4: The Last of Approver
  // ──────────────────────────────────────────

  static async approveByFourthApprover({ id, approverId, remarks, comment }) {
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
      message: "อนุมัติเรียบร้อย และส่งต่อให้ผู้อนุมัติขั้นถัดไป",
      approvedDetail: updatedDetail,
    };
  }

  static async rejectByFourthApprover({ id, approverId, remarks, comment }) {
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
}

module.exports = LeaveRequestService;
