const prisma = require("../config/prisma");
const createError = require("../utils/createError");
const UserService = require("../services/user-service");
const LeaveBalanceService = require("./leaveBalance-service");
const RankService = require("./rank-service");
const ProxyApprovalService = require("./proxyApproval-service");
const AuditLogService = require("./auditLog-service");
const { calculateWorkingDays } = require("../utils/dateCalculate");
const { queueNotification } = require("../utils/emailService");

class LeaveRequestService {
  // ────────────────────────────────────────────────────────────────
  // 🔧 HELPER FUNCTIONS
  // ────────────────────────────────────────────────────────────────

  // แปลงจาก stepOrder เป็น approverLevel
  static stepOrderToApproverLevel(stepOrder) {
    const mapping = {
      1: 1, // APPROVER_1
      2: 2, // VERIFIER
      4: 3, // APPROVER_2
      5: 4, // APPROVER_3
      6: 5, // APPROVER_4
    };
    return mapping[stepOrder] || null;
  }

  // แปลงจาก approverLevel เป็น stepOrder
  static approverLevelToStepOrder(approverLevel) {
    const mapping = {
      1: 1, // APPROVER_1
      2: 2, // VERIFIER
      3: 4, // APPROVER_2
      4: 5, // APPROVER_3
      5: 6, // APPROVER_4
    };
    return mapping[approverLevel] || null;
  }

  // ตรวจสอบและอัปเดต stepOrder ถ้าจำเป็น
  static async validateAndUpdateStepOrder(existingDetail, approverLevel) {
    const expectedStepOrder = this.approverLevelToStepOrder(approverLevel);

    if (!expectedStepOrder) {
      throw createError(400, "ระดับการอนุมัติไม่ถูกต้อง");
    }

    // ถ้า stepOrder ไม่ตรงกัน ให้อัปเดต
    if (existingDetail.stepOrder !== expectedStepOrder) {
      await prisma.leaveRequestDetail.update({
        where: { id: existingDetail.id },
        data: { stepOrder: expectedStepOrder }
      });
      existingDetail.stepOrder = expectedStepOrder;
    }

    return expectedStepOrder;
  }

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
    
    if (typeof requestedDays !== "number" || isNaN(requestedDays)) {
      throw createError(400, "รูปแบบจำนวนวันลาไม่ถูกต้อง");
    }
    
    // ตรวจสอบว่าต้องมีวันทำงานอย่างน้อย 1 วัน
    if (requestedDays <= 0) {
      throw createError(400, "คุณไม่สามารถลาในวันหยุดได้ กรุณาเลือกวันที่มีวันทำงานอย่างน้อย 1 วัน");
    }

    // ตรวจสอบสิทธิ์และดึง verifier พร้อมกัน (refactor)
    const [eligibility, verifiers] = await Promise.all([
      this.checkEligibility(userId, leaveTypeId, requestedDays),
      UserService.getApproversForLevel(2, new Date()) // Level 2 = VERIFIER
    ]);

    if (!eligibility.success) throw createError(400, eligibility.message);
    if (!verifiers || verifiers.length === 0) throw createError(5001, "ไม่พบผู้ตรวจสอบในระบบ โปรดติดต่อผู้ดูแลระบบ");

    // เลือกผู้ตรวจสอบคนอื่นก่อน แต่ถ้าไม่มี ให้ใช้ผู้ยื่นเองได้
    // (ระบบมีผู้ตรวจสอบคนเดียว ถ้าปล่อยว่างใบลาจะไม่ได้เลขที่)
    const verifier = verifiers.find((v) => v.id !== userId) || verifiers[0];

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
          verifierId: verifier ? verifier.id : null,
          status: "PENDING",
        },
      });
    } catch (error) {
      throw createError(500, "สร้างคำขอลาไม่สำเร็จ");
    }

    // ดึง user พร้อม department
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        department: true,
        positionNumbers: {
          where: { isCurrent: true },
          select: {
            positionNumber: true,
            effectiveFrom: true,
          },
        },
      },
    });

    if (!user) throw createError(404, "ไม่พบข้อมูลผู้ใช้งาน");

    // หาผู้รับผิดชอบขั้นแรกที่ "ไม่ใช่ผู้ยื่นเอง"
    // ไล่ตามสายอนุมัติ: หัวหน้าสาขา -> ผู้ตรวจสอบ -> สารบรรณคณะ -> รองคณบดี -> คณบดี
    const firstStep = await this.resolveFirstPendingStep(
      userId,
      user.department?.headId
    );

    if (!firstStep) {
      throw createError(
        500,
        "ไม่พบผู้อนุมัติที่สามารถดำเนินการคำขอนี้ได้ (ผู้อนุมัติทุกระดับเป็นผู้ยื่นเอง) โปรดติดต่อผู้ดูแลระบบ"
      );
    }

    if (firstStep.stepOrder !== 1) {
      console.log(
        `createRequest: ข้ามขั้นหัวหน้าสาขาสำหรับคำขอ #${leaveRequest.id} ` +
          `-> เริ่มที่ขั้น ${firstStep.stepOrder} (user#${firstStep.approverId})`
      );
    }

    // เพิ่ม approval step แรกของคำขอนี้
    try {
      await prisma.leaveRequestDetail.create({
        data: {
          leaveRequestId: leaveRequest.id,
          approverId: firstStep.approverId,
          stepOrder: firstStep.stepOrder,
          status: "PENDING",
        },
      });
    } catch (error) {
      throw createError(500, "สร้าง approval step ไม่สำเร็จ");
    }

    // ส่งอีเมลแจ้งเตือนให้ผู้ที่ต้องดำเนินการขั้นแรกจริง (หัวหน้าสาขา หรือผู้ตรวจสอบเมื่อข้ามขั้น)
    this.notifyApprover({
      approverId: firstStep.approverId,
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
    if (!approver?.email) return;

    queueNotification("SUBMISSION", {
      to: approver.email,
      userName: `${approver.prefixName} ${approver.firstName} ${approver.lastName}`,
      requesterName: `${user.prefixName} ${user.firstName} ${user.lastName}`,
      requestedDays,
      reason,
      contact,
    });
  }

  static async notifyRequester({ user, requestedDays, reason, contact }) {
    if (!user?.email) return;

    queueNotification("SUBMISSION_CONFIRM", {
      to: user.email,
      userName: `${user.prefixName} ${user.firstName} ${user.lastName}`,
      requestedDays,
      reason,
      contact,
    });
  }

  // ดึงข้อมูลการลาสำหรับใส่ในอีเมลแจ้งเตือน (ชนิดการลา/ช่วงวันที่/จำนวนวัน/เหตุผล)
  static async getLeaveEmailInfo(leaveRequestId) {
    try {
      const lr = await prisma.leaveRequest.findUnique({
        where: { id: leaveRequestId },
        include: { leaveType: true },
      });
      if (!lr) return {};
      const fmt = (x) =>
        x
          ? new Date(x).toLocaleDateString("th-TH", { day: "2-digit", month: "short", year: "numeric" })
          : "";
      return {
        leaveTypeName: lr.leaveType?.name,
        dateRange: lr.startDate && lr.endDate ? `${fmt(lr.startDate)} - ${fmt(lr.endDate)}` : undefined,
        requestedDays: lr.thisTimeDays,
        reason: lr.reason,
      };
    } catch (e) {
      return {};
    }
  }

  // ────────────────────────────────
  // 🔎 READ
  // ────────────────────────────────

  // ดึงคำขอลารายการเดียว (findUnique) สำหรับตรวจสอบความเป็นเจ้าของ/สิทธิ์
  static async getRequestById(requestId) {
    return await prisma.leaveRequest.findUnique({
      where: { id: Number(requestId) },
      select: { id: true, userId: true, status: true },
    });
  }

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
          orderBy: { stepOrder: "asc" },
        },
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
            userRoles: {
              include: {
                role: true,
              },
            },
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
      include: {
        personnelType: true,
      },
    });
    if (!user) throw createError(404, "ไม่พบข้อมูลผู้ใช้งาน");

    const leaveTypeIdInt = parseInt(leaveTypeId);
    if (isNaN(leaveTypeIdInt)) throw createError(400, "leaveTypeId ไม่ถูกต้อง");

    const leaveType = await prisma.leaveType.findUnique({
      where: { id: leaveTypeIdInt },
      select: { id: true, name: true },
    });
    if (!leaveType) throw createError(404, "ไม่พบประเภทการลา");

    const coreLeaveTypeNames = new Set([
      "ลาป่วย",
      "ลากิจส่วนตัว",
      "ลาพักผ่อน",
    ]);

    const fiscalYearSetting = await prisma.setting.findUnique({
      where: { key: "fiscalYear" },
      select: { value: true },
    });
    const fiscalYear = fiscalYearSetting
      ? Number.parseInt(fiscalYearSetting.value, 10)
      : null;

    if (!coreLeaveTypeNames.has(String(leaveType.name || "").trim())) {
      // ตรวจสอบว่าเป็นประเภทการลาที่ไม่ต้องหักวันหรือไม่ (receiveDays = 0 && isBalance = 1)
      // หรือเป็นประเภทพิเศษที่กำหนดไว้ (leaveTypeId: 5, 6, 10, 11, 13)
      const specialLeaveTypes = [5, 6, 10, 11, 13];

      // ตรวจสอบจาก Rank ว่าเป็นประเภทที่ไม่ต้องหักวันหรือไม่
      const userRank = await prisma.userRank.findFirst({
        where: {
          userId,
          rank: {
            leaveTypeId: leaveTypeIdInt
          }
        },
        include: {
          rank: true
        }
      });

      const isNonDeductible = userRank?.rank?.receiveDays === 0 && userRank?.rank?.isBalance === true;

      if (isNonDeductible || specialLeaveTypes.includes(leaveTypeIdInt)) {
        // สำหรับประเภทการลาที่ไม่ต้องหักวัน ให้ข้ามการตรวจสอบยอดคงเหลือ
        return { success: true, message: "ประเภทการลานี้ไม่ต้องตรวจสอบยอดคงเหลือ" };
      }

      const balance = Number.isFinite(fiscalYear)
        ? await prisma.leaveBalance.findFirst({
            where: {
              userId,
              leaveTypeId: leaveTypeIdInt,
              year: fiscalYear,
            },
            orderBy: [{ id: "desc" }],
          })
        : null;

      const fallbackBalance =
        balance ||
        (await prisma.leaveBalance.findFirst({
          where: {
            userId,
            leaveTypeId: leaveTypeIdInt,
          },
          orderBy: [{ year: "desc" }, { id: "desc" }],
        }));

      if (!fallbackBalance) {
        return { success: false, message: "ไม่พบข้อมูล Leave Balance ของคุณ" };
      }

      const remainingNow = Number(fallbackBalance.remainingDays) || 0;
      const overQuotaDays = Math.max(0, Number(requestedDays || 0) - remainingNow);

      return {
        success: true,
        message: "ผ่านการตรวจสอบสิทธิ์การลา",
        rankInfo: null,
        balance: fallbackBalance,
        bypassRank: true,
        overQuotaDays,
      };
    }

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

    const rankReceiveDays = rank.receiveDays ?? requestedDays + 1;

    const coreBalance = Number.isFinite(fiscalYear)
      ? await prisma.leaveBalance.findFirst({
          where: {
            userId,
            leaveTypeId: parseInt(leaveTypeId),
            year: fiscalYear,
          },
          orderBy: [{ id: "desc" }],
        })
      : null;

    const balance =
      coreBalance ||
      (await prisma.leaveBalance.findFirst({
        where: {
          userId,
          leaveTypeId: parseInt(leaveTypeId),
        },
        orderBy: [{ year: "desc" }, { id: "desc" }],
      }));

    if (!balance) {
      return { success: false, message: "ไม่พบข้อมูล Leave Balance ของคุณ" };
    }
    const remainingNow = Number(balance.remainingDays) || 0;
    const overQuotaDays = Math.max(0, Number(requestedDays || 0) - remainingNow);

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
      overQuotaDays,
    };
  }

  // อัปเดตเลขที่เอกสาร (not used) (backup)
  static async updateRequest(requestId, updateData) {
    return await prisma.leaveRequest.update({
      where: { id: requestId },
      data: updateData,
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

  static async getPendingRequestsByFirstApprover(approverUserId) {
    // ดึงข้อมูลแผนกของหัวหน้าสาขาที่กำลัง login
    const approverUser = await UserService.getUserByIdWithRoles(approverUserId);
    if (!approverUser || !approverUser.departmentId) {
      throw createError(400, "ไม่พบข้อมูลแผนกของหัวหน้าสาขา");
    }

    // ดึง approvers ที่ใช้งานได้ในวันนี้ (รวม proxy)
    const approvers = await UserService.getApproversForLevel(1, new Date());
    const approverIds = approvers.map(v => v.id);

    return await prisma.leaveRequest.findMany({
      where: {
        status: "PENDING",
        // กรองเฉพาะคำร้องจากแผนกเดียวกับหัวหน้าสาขา
        user: {
          departmentId: approverUser.departmentId
        },
        leaveRequestDetails: {
          some: {
            stepOrder: 1,
            status: "PENDING",
            approverId: { in: approverIds }, // กรองตาม approver IDs (รวม proxy)
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
                id: true,
                name: true,
              },
            },
          },
        },
        leaveType: true,
        leaveRequestDetails: { where: { stepOrder: 1, status: "PENDING", approverId: { in: approverIds } } },
        files: true,
      },
      orderBy: { createdAt: "desc" },
    });
  }

  static async getPendingRequestsByVerifier() {
    console.log('🔍 Debug - getPendingRequestsByVerifier');

    // ดึง verifiers ที่ใช้งานได้ในวันนี้ (รวม proxy)
    const verifiers = await UserService.getApproversForLevel(2, new Date());
    const verifierIds = verifiers.map(v => v.id);

    console.log('👥 Verifiers found:', verifiers.map(v => ({ id: v.id, firstName: v.firstName, lastName: v.lastName, isProxy: v.isProxy })));

    const requests = await prisma.leaveRequest.findMany({
      where: {
        status: "PENDING",
        leaveRequestDetails: {
          some: {
            stepOrder: 2,
            status: "PENDING",
            approverId: { in: verifierIds }, // กรองตาม verifier IDs (รวม proxy)
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
        leaveRequestDetails: { where: { stepOrder: 2, status: "PENDING", approverId: { in: verifierIds } } },
        files: true,
      },
      orderBy: { createdAt: "desc" },
    });

    console.log('📋 Leave requests for verifier:', requests.length);
    console.log('📋 Sample request:', requests[0] || 'No requests');

    return requests;
  }

  static async getPendingRequestsBySecondApprover() {
    // ดึง approvers ที่ใช้งานได้ในวันนี้ (รวม proxy)
    const approvers = await UserService.getApproversForLevel(3, new Date());
    const approverIds = approvers.map(v => v.id);

    return await prisma.leaveRequest.findMany({
      where: {
        status: "PENDING",
        leaveRequestDetails: {
          some: {
            stepOrder: 4,
            status: "PENDING",
            approverId: { in: approverIds }, // กรองตาม approver IDs (รวม proxy)
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
            status: "PENDING",
            approverId: { in: approverIds }, // กรองเฉพาะที่เป็น approver หรือ proxy
          },
          include: {
            approver: {
              select: {
                id: true,
                prefixName: true,
                firstName: true,
                lastName: true,
              }
            }
          }
        },
        files: true,
      },
    });
  }

  static async getPendingRequestsByThirdApprover() {
    // ดึง approvers ที่ใช้งานได้ในวันนี้ (รวม proxy)
    const approvers = await UserService.getApproversForLevel(4, new Date());
    const approverIds = approvers.map(v => v.id);

    return await prisma.leaveRequest.findMany({
      where: {
        status: "PENDING",
        leaveRequestDetails: {
          some: {
            stepOrder: 5,
            status: "PENDING",
            approverId: { in: approverIds }, // กรองตาม approver IDs (รวม proxy)
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
            status: "PENDING",
            approverId: { in: approverIds }, // กรองเฉพาะที่เป็น approver หรือ proxy
          },
          include: {
            approver: {
              select: {
                id: true,
                prefixName: true,
                firstName: true,
                lastName: true,
              }
            }
          }
        },
        files: true,
      },
    });
  }

  static async getPendingRequestsByFourthApprover() {
    // ดึง approvers ที่ใช้งานได้ในวันนี้ (รวม proxy)
    const approvers = await UserService.getApproversForLevel(5, new Date());
    const approverIds = approvers.map(v => v.id);

    return await prisma.leaveRequest.findMany({
      where: {
        status: "PENDING",
        leaveRequestDetails: {
          some: {
            stepOrder: 6,
            status: "PENDING",
            approverId: { in: approverIds }, // กรองตาม approver IDs (รวม proxy)
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
            status: "PENDING",
            approverId: { in: approverIds }, // กรองเฉพาะที่เป็น approver หรือ proxy
          },
          include: {
            approver: {
              select: {
                id: true,
                prefixName: true,
                firstName: true,
                lastName: true,
              }
            }
          }
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

  /**
   * กันไม่ให้ผู้ใช้อนุมัติ/ปฏิเสธคำขอลาของตัวเอง
   *
   * เดิมทุกขั้นตรวจแค่ว่า "ผู้กดมีบทบาทในระดับนั้นหรือไม่" จึงเปิดช่องให้หัวหน้าสาขา
   * หรือผู้อนุมัติระดับคณะกดอนุมัติใบลาที่ตัวเองเป็นผู้ยื่นได้
   */
  /**
   * ลำดับขั้นการอนุมัติหลังพ้นหัวหน้าสาขา (stepOrder -> บทบาทที่รับผิดชอบ)
   */
  static get APPROVAL_CHAIN() {
    return [
      { stepOrder: 2, roleName: "VERIFIER" },
      { stepOrder: 4, roleName: "APPROVER_2" },
      { stepOrder: 5, roleName: "APPROVER_3" },
      { stepOrder: 6, roleName: "APPROVER_4" },
    ];
  }

  /**
   * หาขั้นแรกของคำขอที่มีผู้รับผิดชอบซึ่ง "ไม่ใช่ผู้ยื่นเอง"
   *
   * ปกติเริ่มที่หัวหน้าสาขาของผู้ยื่น แต่ถ้าผู้ยื่นเป็นหัวหน้าสาขาเอง (หรือสาขายังไม่มีหัวหน้า)
   * จะไล่ขึ้นไปตามสายอนุมัติจนเจอคนที่ดำเนินการแทนได้ เพื่อไม่ให้เกิดการอนุมัติให้ตัวเอง
   * และไม่ให้คำขอค้างโดยไม่มีผู้รับผิดชอบ
   */
  static async resolveFirstPendingStep(requesterId, departmentHeadId) {
    // ใช้หัวหน้าสาขาเสมอ แม้ผู้ยื่นจะเป็นหัวหน้าสาขาเอง
    if (departmentHeadId) {
      const headIsApprover = await prisma.userRole.findFirst({
        where: { userId: departmentHeadId, role: { name: "APPROVER_1" } },
      });
      if (headIsApprover) {
        return { approverId: departmentHeadId, stepOrder: 1 };
      }
    }

    // ไล่ขึ้นตามสายเฉพาะเมื่อสาขายังไม่มีหัวหน้า (หรือหัวหน้าไม่มีบทบาท APPROVER_1)
    for (const step of this.APPROVAL_CHAIN) {
      const holder = await prisma.userRole.findFirst({
        where: { role: { name: step.roleName } },
        orderBy: { id: "asc" },
      });
      if (holder) {
        return { approverId: holder.userId, stepOrder: step.stepOrder };
      }
    }

    return null;
  }

  /**
   * เลือกผู้อนุมัติของขั้นถัดไปตามบทบาท โดยไม่เลือกผู้ยื่นคำขอเอง
   * (เดิมใช้ findFirst ตรง ๆ จึงมีโอกาสได้ผู้ยื่นเป็นผู้อนุมัติของตัวเอง)
   */
  static async pickNextApprover(roleName, leaveRequestId) {
    const request = await prisma.leaveRequest.findUnique({
      where: { id: Number(leaveRequestId) },
      select: { userId: true },
    });

    // ไม่ตัดผู้ยื่นออก — ระบบมีผู้ถือแต่ละบทบาทคนเดียว ถ้าตัดออกจะไม่มีใครรับขั้นถัดไป
    // และใบลาจะไม่ได้เลขที่ (เลขที่ออกตอนผู้ตรวจสอบอนุมัติ)
    void request;

    return prisma.userRole.findFirst({
      where: { role: { name: roleName } },
      orderBy: { id: "asc" },
    });
  }

  /**
   * ตรวจว่าผู้ดำเนินการถือบทบาทของขั้นนั้นจริง (รวมผู้รับมอบอำนาจ)
   *
   * เดิมมีเฉพาะบางฟังก์ชัน ทำให้ approve ระดับ APPROVER_3/APPROVER_4
   * และ reject เกือบทุกระดับเปิดให้ผู้ใช้ที่ล็อกอินแล้วคนใดก็ได้ดำเนินการ
   */
  static async assertApproverPermission(approverLevel, approverId) {
    const approvers = await UserService.getApproversForLevel(
      approverLevel,
      new Date()
    );
    const approverIds = approvers.map((a) => a.id);

    if (!approverIds.includes(Number(approverId))) {
      throw createError(403, "คุณไม่มีสิทธิ์ดำเนินการในระดับนี้");
    }
  }

  /**
   * ขั้นที่ 1 เป็นการอนุมัติของ "หัวหน้าสาขาของผู้ยื่น" เท่านั้น
   *
   * คิวอนุมัติกรองตามสาขาอยู่แล้ว แต่ตัวจัดการ approve ตรวจแค่ว่ามีบทบาท APPROVER_1
   * หัวหน้าสาขาอื่นจึงอนุมัติคำขอข้ามสาขาได้ถ้ารู้ id ของรายการ
   * ผู้รับมอบอำนาจ (proxy) ยังทำแทนได้ตามปกติ
   */
  static async assertFirstStepDepartmentScope(leaveRequestId, approverId, isProxy) {
    if (isProxy) return;

    const request = await prisma.leaveRequest.findUnique({
      where: { id: Number(leaveRequestId) },
      select: {
        user: {
          select: {
            department: { select: { name: true, headId: true } },
          },
        },
      },
    });

    const head = request?.user?.department;
    if (head?.headId && head.headId !== Number(approverId)) {
      throw createError(
        403,
        `คุณไม่ใช่หัวหน้าสาขาของผู้ยื่นคำขอนี้ (${head.name})`
      );
    }
  }

  /**
   * ตรวจว่าเป็นการอนุมัติ/ปฏิเสธคำขอของตัวเองหรือไม่
   *
   * ระบบอนุญาตให้ทำได้ (ผู้ถือแต่ละบทบาทมีคนเดียว การบังคับห้ามจะทำให้ใบลาค้าง
   * และไม่ได้เลขที่) แต่ต้องบันทึกไว้ให้ตรวจสอบย้อนหลังได้
   */
  static async isSelfReview(leaveRequestId, actingUserId) {
    const request = await prisma.leaveRequest.findUnique({
      where: { id: Number(leaveRequestId) },
      select: { userId: true },
    });
    return !!request && request.userId === Number(actingUserId);
  }

  /**
   * บันทึก audit log เมื่อผู้ใช้ดำเนินการกับคำขอลาของตนเอง
   * ไม่ปิดกั้นการทำงาน และไม่ให้ error จากการเขียน log ทำให้การอนุมัติล้มเหลว
   */
  static async logSelfReview(leaveRequestId, actingUserId, action) {
    try {
      if (!(await this.isSelfReview(leaveRequestId, actingUserId))) return;

      await AuditLogService.createLog(
        Number(actingUserId),
        "SELF_APPROVE",
        "LeaveRequest",
        Number(leaveRequestId),
        `ผู้ใช้ดำเนินการ (${action}) กับคำขอลาของตนเอง`
      );
    } catch (err) {
      console.error("logSelfReview:", err.message);
    }
  }

  static async approveByFirstApprover({ id, approverId, remarks, comment }) {
    // 1. ตรวจสอบว่า leaveRequestDetail นี้มีอยู่หรือไม่
    const existingDetail = await prisma.leaveRequestDetail.findUnique({
      where: { id: Number(id) },
    });

    if (!existingDetail) throw createError(404, "ไม่พบรายการคำขอลา");

    // อนุญาตให้ดำเนินการกับคำขอของตนเองได้ แต่บันทึกไว้ให้ตรวจสอบย้อนหลัง
    await this.logSelfReview(existingDetail.leaveRequestId, approverId, "approveByFirstApprover");

    // ตรวจสอบสถานะว่าต้องเป็น PENDING เท่านั้น
    if (existingDetail.status !== "PENDING") {
      throw createError(
        400,
        "รายการคำขอนี้ไม่อยู่ในสถานะรอดำเนินการ (PENDING)"
      );
    }

    // ตรวจสอบและอัปเดต stepOrder ให้ถูกต้อง
    const approverLevel = 1; // APPROVER_1
    const stepOrder = await this.validateAndUpdateStepOrder(existingDetail, approverLevel);

    // ตรวจสอบสิทธิ์การอนุมัติ (รวมถึงการอนุมัติแทน) - ใช้วิธีเดียวกับ controller
    const approvers = await UserService.getApproversForLevel(approverLevel, new Date());
    const approverIds = approvers.map(a => a.id);

    if (!approverIds.includes(approverId)) {
      throw createError(403, "คุณไม่มีสิทธิ์อนุมัติในระดับนี้");
    }

    // ดึงข้อมูล proxy approval สำหรับบันทึก (ถ้าเป็น proxy)
    const permission = await ProxyApprovalService.canUserApprove(approverId, approverLevel);

    // ตรวจสอบว่าเป็นการอนุมัติแทนหรือไม่
    let proxyApprovalId = null;

    if (permission.isProxy) {
      proxyApprovalId = permission.proxyApproval.id;
    }

    // ขั้นที่ 1 อนุมัติได้เฉพาะหัวหน้าสาขาของผู้ยื่น (หรือผู้รับมอบอำนาจ)
    await this.assertFirstStepDepartmentScope(
      existingDetail.leaveRequestId,
      approverId,
      permission.isProxy
    );

    // หมายเหตุ: ไม่ต้องเช็คว่า existingDetail.approverId ตรงกับ approverId หรือไม่
    // เพราะถ้า user มีสิทธิ์ approve ในระดับนี้ (อยู่ใน approverIds แล้ว) ก็ควรอนุญาตให้ approve ได้
    // ไม่ว่าจะถูก assign ไว้ให้คนไหนก็ตาม

    // 2. อัปเดตรายการคำขอลา (step 1)
    const updatedDetail = await prisma.$transaction(async (tx) => {
      const detail = await tx.leaveRequestDetail.update({
        where: { id: Number(id) },
        data: {
          approverId, // บันทึกว่าใครเป็นผู้อนุมัติจริง
          status: "APPROVED",
          reviewedAt: new Date(),
          remarks,
          comment,
          proxyApprovalId, // บันทึกว่าเป็นการอนุมัติแทน (ถ้ามี)
        },
        include: {
          leaveRequest: true,
        },
      });

      return detail;
    });

    // บันทึก log การทำงาน

    // 3. หา verifier user
    const verifier = await this.pickNextApprover(
      "VERIFIER",
      updatedDetail.leaveRequestId
    );

    if (!verifier)
      throw createError(404, "ไม่พบผู้ตรวจสอบ (VERIFIER) ที่ตรวจคำขอนี้ได้");

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

    const leaveInfo = await this.getLeaveEmailInfo(updatedDetail.leaveRequestId);

    if (verifierUser.email) {
      const notificationData = {
        to: verifierUser.email,
        userName: `${verifierUser.prefixName} ${verifierUser.firstName} ${verifierUser.lastName}`,
      };

      // ถ้าเป็นการอนุมัติแทน ให้เพิ่มข้อมูลผู้อนุมัติแทน
      if (permission.isProxy && permission.proxyApproval) {
        // ดึงข้อมูล proxy approver (ผู้อนุมัติจริง)
        const proxyApproverUser = await prisma.user.findUnique({
          where: { id: approverId },
          select: {
            prefixName: true,
            firstName: true,
            lastName: true,
          },
        });

        if (proxyApproverUser && permission.proxyApproval.originalApprover) {
          notificationData.proxyApprover = `${proxyApproverUser.prefixName} ${proxyApproverUser.firstName} ${proxyApproverUser.lastName}`;
          notificationData.originalApprover = `${permission.proxyApproval.originalApprover.prefixName} ${permission.proxyApproval.originalApprover.firstName} ${permission.proxyApproval.originalApprover.lastName}`;
        }
      }

      Object.assign(notificationData, leaveInfo);
      queueNotification("APPROVER1_APPROVED", notificationData);
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
      const notificationData = {
        to: requester.email,
        userName: `${requester.prefixName} ${requester.firstName} ${requester.lastName}`,
      };

      // ถ้าเป็นการอนุมัติแทน ให้เพิ่มข้อมูลผู้อนุมัติแทน
      if (permission.isProxy && permission.proxyApproval) {
        // ดึงข้อมูล proxy approver (ผู้อนุมัติจริง)
        const proxyApproverUser = await prisma.user.findUnique({
          where: { id: approverId },
          select: {
            prefixName: true,
            firstName: true,
            lastName: true,
          },
        });

        if (proxyApproverUser && permission.proxyApproval.originalApprover) {
          notificationData.proxyApprover = `${proxyApproverUser.prefixName} ${proxyApproverUser.firstName} ${proxyApproverUser.lastName}`;
          notificationData.originalApprover = `${permission.proxyApproval.originalApprover.prefixName} ${permission.proxyApproval.originalApprover.firstName} ${permission.proxyApproval.originalApprover.lastName}`;
        }
      }

      Object.assign(notificationData, leaveInfo);
      queueNotification("STEP_APPROVED_1", notificationData);
    }

    return {
      message: permission.isProxy
        ? "อนุมัติเรียบร้อย (โดยผู้อนุมัติแทน) และส่งต่อให้ผู้ตรวจสอบ"
        : "อนุมัติเรียบร้อย และส่งต่อให้ผู้ตรวจสอบ",
      approvedDetail: updatedDetail,
      nextStepDetail: newDetail,
      isProxy: permission.isProxy,
      proxyApproval: permission.proxyApproval,
    };
  }

  static async rejectByFirstApprover({ id, approverId, remarks, comment }) {
    // 1. ตรวจสอบว่า LeaveRequestDetail นี้มีอยู่หรือไม่
    const existingDetail = await prisma.leaveRequestDetail.findUnique({
      where: { id: Number(id) },
      include: {
        leaveRequest: {
          include: {
            user: true,
            leaveType: true
          }
        }
      }
    });

    if (!existingDetail) throw createError(404, "ไม่พบรายการคำขอลา");

    // อนุญาตให้ดำเนินการกับคำขอของตนเองได้ แต่บันทึกไว้ให้ตรวจสอบย้อนหลัง
    await this.logSelfReview(existingDetail.leaveRequestId, approverId, "rejectByFirstApprover");

    // ตรวจสิทธิ์: ต้องถือบทบาทของขั้นนี้จริง
    await this.assertApproverPermission(1, approverId);

    // ขั้นที่ 1 ปฏิเสธได้เฉพาะหัวหน้าสาขาของผู้ยื่น (หรือผู้รับมอบอำนาจ)
    const rejectPermission = await ProxyApprovalService.canUserApprove(
      approverId,
      1
    );
    await this.assertFirstStepDepartmentScope(
      existingDetail.leaveRequestId,
      approverId,
      rejectPermission.isProxy
    );

    // ตรวจสอบสถานะว่าต้องเป็น PENDING เท่านั้น
    if (existingDetail.status !== "PENDING") {
      throw createError(
        400,
        "รายการคำขอนี้ไม่อยู่ในสถานะรอดำเนินการ (PENDING)"
      );
    }

    // 🔥 ใช้ Transaction เพื่อความปลอดภัย
    const result = await prisma.$transaction(async (tx) => {
      const userId = existingDetail.leaveRequest.userId;
      const leaveTypeId = existingDetail.leaveRequest.leaveTypeId;
      const requestedDays = existingDetail.leaveRequest.thisTimeDays;
      
      console.log(`🔄 คืน balance: User ${userId}, Type ${leaveTypeId}, Days ${requestedDays}`);
      
      // คืน days ใน userLeaveBalance
      const currentYear = new Date().getFullYear();
      const balanceRecord = await tx.leaveBalance.findFirst({
        where: {
          AND: [
            { userId },
            { leaveTypeId },
            { year: currentYear } // 🎯 ค้นปีปัจจุบัน
          ]
        }
      });
      
      console.log(`🔍 Balance Record Found:`, balanceRecord);
      
      if (balanceRecord) {
        const currentRemaining = balanceRecord.remainingDays || 0;
        const currentPending = balanceRecord.pendingDays || 0;
        const newRemaining = currentRemaining + requestedDays;
        const newPending = Math.max(0, currentPending - requestedDays);
        
        console.log(`🔄 Balance Update:`, {
          currentRemaining,
          currentPending,
          requestedDays,
          newRemaining,
          newPending
        });
        
        await tx.leaveBalance.update({
          where: { id: balanceRecord.id },
          data: {
            remainingDays: newRemaining,
            pendingDays: newPending,
          },
        });
        
        console.log(`✅ Balance Updated Successfully`);
      } else {
        console.log(`❌ No Balance Record Found for User ${userId}, Type ${leaveTypeId}`);
      }

      // อัปเดตรายการคำขอลา
      const updatedDetail = await tx.leaveRequestDetail.update({
        where: { id: Number(id) },
        data: {
          approverId,
          status: "REJECTED",
          reviewedAt: new Date(),
          remarks,
          comment,
        },
        include: {
          leaveRequest: true,
        },
      });

      await tx.LeaveRequest.update({
        where: { id: updatedDetail.leaveRequestId },
        data: {
          status: "REJECTED",
        },
      });

      return updatedDetail;
    });

    // บันทึก audit log (นอก transaction)
    await AuditLogService.createLog(
      approverId,
      'LEAVE_REQUEST_REJECTED',
      'LeaveRequest',
      result.leaveRequestId,
      `ปฏิเสธคำขอลา ${existingDetail.leaveRequest.thisTimeDays} วัน และคืน balance`,
      null,
      'SYSTEM',
      {
        userId: existingDetail.leaveRequest.userId,
        leaveTypeId: existingDetail.leaveRequest.leaveTypeId,
        requestedDays: existingDetail.leaveRequest.thisTimeDays,
        rejectedBy: approverId,
        action: 'REJECT',
        balanceChange: {
          daysReturned: existingDetail.leaveRequest.thisTimeDays,
          reason: 'REJECT_LEAVE_REQUEST'
        }
      }
    );

    // 3. ส่งอีเมลแจ้งเตือนให้ผู้ขออนุมัติ
    const requester = await prisma.user.findUnique({
      where: { id: result.leaveRequest.userId },
      select: {
        email: true,
        prefixName: true,
        firstName: true,
        lastName: true,
      },
    });

    if (requester.email) {
      const leaveInfo = await this.getLeaveEmailInfo(result.leaveRequestId);
      queueNotification("REJECTION", {
        ...leaveInfo,
        to: requester.email,
        userName: `${requester.prefixName} ${requester.firstName} ${requester.lastName}`,
        remarks,
      });
    }

    return {
      message: "รายการคำขอลาถูกปฏิเสธเรียบร้อย",
      rejectedDetail: result,
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
      },
    });
    if (!existingDetail) throw createError(404, "ไม่พบรายการคำขอลา");

    // อนุญาตให้ดำเนินการกับคำขอของตนเองได้ แต่บันทึกไว้ให้ตรวจสอบย้อนหลัง
    await this.logSelfReview(existingDetail.leaveRequestId, approverId, "approveByVerifier");

    // ตรวจสอบสถานะว่าต้องเป็น PENDING เท่านั้น
    if (existingDetail.status !== "PENDING") {
      throw createError(
        400,
        "รายการคำขอนี้ไม่อยู่ในสถานะรอดำเนินการ (PENDING)"
      );
    }

    // ตรวจสอบและอัปเดต stepOrder ให้ถูกต้อง
    const approverLevel = 2; // VERIFIER
    const stepOrder = await this.validateAndUpdateStepOrder(existingDetail, approverLevel);

    // ตรวจสอบสิทธิ์การอนุมัติ (รวมถึงการอนุมัติแทน) - ใช้วิธีเดียวกับ controller
    const verifiers = await UserService.getApproversForLevel(approverLevel, new Date());
    const verifierIds = verifiers.map(v => v.id);

    if (!verifierIds.includes(approverId)) {
      throw createError(403, "คุณไม่มีสิทธิ์อนุมัติในระดับนี้");
    }

    // ดึงข้อมูล proxy approval สำหรับบันทึก (ถ้าเป็น proxy)
    const permission = await ProxyApprovalService.canUserApprove(approverId, approverLevel);

    console.log('🔍 Debug - Permission check:', {
      approverId,
      approverLevel,
      permission,
      isProxy: permission.isProxy,
      proxyApproval: permission.proxyApproval
    });

    // ตรวจสอบว่าเป็นการอนุมัติแทนหรือไม่
    let proxyApprovalId = null;

    if (permission.isProxy) {
      proxyApprovalId = permission.proxyApproval.id;
    }
    // หมายเหตุ: ไม่ต้องเช็คว่า existingDetail.approverId ตรงกับ approverId หรือไม่
    // เพราะถ้า user มีสิทธิ์ approve ในระดับนี้ (อยู่ใน approverIds แล้ว) ก็ควรอนุญาตให้ approve ได้

    const parseRunNumber = (value) => {
      const match = String(value || "").match(/^(.*\.)(\d+)(\/\d{2})$/);
      if (!match) return null;
      return {
        prefix: match[1],
        number: match[2],
        suffix: match[3],
      };
    };

    // 2. รันเลขเอกสารเมื่อ verifier กดผ่าน (เฉพาะกรณียังไม่มีเลข)
    const updatedDetail = await prisma.$transaction(async (tx) => {
      const detail = await tx.leaveRequestDetail.findUnique({
        where: { id: Number(id) },
        include: { leaveRequest: true },
      });
      if (!detail || detail.stepOrder !== stepOrder) throw createError(404, "ไม่พบรายการคำขอลา");
      if (detail.status !== "PENDING") {
        throw createError(400, "รายการคำขอนี้ไม่อยู่ในสถานะรอดำเนินการ (PENDING)");
      }

      if (!detail.leaveRequest.documentNumber) {
        const locked = await tx.$queryRaw`
          SELECT * FROM setting WHERE \`key\` = 'runNumber' LIMIT 1 FOR UPDATE
        `;
        const runSetting = Array.isArray(locked) ? locked[0] : null;
        if (!runSetting?.id) throw createError(500, "ไม่พบ setting: runNumber");

        const parsed = parseRunNumber(runSetting.value);
        if (!parsed) throw createError(500, "รูปแบบ runNumber ไม่ถูกต้อง");

        const nextNumber = parseInt(parsed.number, 10) + 1;
        const nextNumberPadded = nextNumber
          .toString()
          .padStart(parsed.number.length, "0");
        const documentNumber = `${parsed.prefix}${nextNumberPadded}${parsed.suffix}`;

        await tx.setting.update({
          where: { id: runSetting.id },
          data: { value: documentNumber },
        });

        await tx.leaveRequest.update({
          where: { id: detail.leaveRequestId },
          data: {
            documentNumber,
            documentIssuedDate: new Date(),
          },
        });
      }

      return await tx.leaveRequestDetail.update({
        where: { id: Number(id) },
        data: {
          approverId, // บันทึกว่าใครเป็นผู้อนุมัติจริง
          status: "APPROVED",
          reviewedAt: new Date(),
          remarks,
          comment,
          proxyApprovalId, // บันทึกว่าเป็นการอนุมัติแทน (ถ้ามี)
        },
        include: {
          leaveRequest: true,
        },
      });
    });

    // บันทึก log การทำงาน

    // 3. หา APPROVER_2
    const approver = await this.pickNextApprover(
      "APPROVER_2",
      updatedDetail.leaveRequestId
    );

    if (!approver)
      throw createError(404, "ไม่พบผู้อนุมัติ (APPROVER_2) ที่อนุมัติคำขอนี้ได้");

    // 4. สร้าง LeaveRequestDetail ใหม่สำหรับ approver
    const newDetail = await prisma.leaveRequestDetail.create({
      data: {
        approverId: approver.userId,
        leaveRequestId: updatedDetail.leaveRequestId,
        stepOrder: this.approverLevelToStepOrder(3), // APPROVER_2 -> Step 4
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

    const leaveInfo = await this.getLeaveEmailInfo(updatedDetail.leaveRequestId);

    if (approverUser.email) {
      queueNotification("VERIFIER_APPROVED", {
        ...leaveInfo,
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
      queueNotification("STEP_APPROVED_2", {
        ...leaveInfo,
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
    // 1. ตรวจสอบว่า leaveRequestDetail นี้มีอยู่หรือไม่ (ดึง leaveRequest มาด้วยเพื่อคืน balance)
    const existingDetail = await prisma.leaveRequestDetail.findFirst({
      where: {
        id: Number(id),
      },
      include: {
        leaveRequest: { include: { user: true, leaveType: true } },
      },
    });
    if (!existingDetail) throw createError(404, "ไม่พบรายการคำขอลา");

    // อนุญาตให้ดำเนินการกับคำขอของตนเองได้ แต่บันทึกไว้ให้ตรวจสอบย้อนหลัง
    await this.logSelfReview(existingDetail.leaveRequestId, approverId, "rejectByVerifier");

    // ตรวจสอบสถานะว่าต้องเป็น PENDING เท่านั้น
    if (existingDetail.status !== "PENDING") {
      throw createError(
        400,
        "รายการคำขอนี้ไม่อยู่ในสถานะรอดำเนินการ (PENDING)"
      );
    }

    // ตรวจสอบและอัปเดต stepOrder ให้ถูกต้อง
    const approverLevel = 2; // VERIFIER
    const stepOrder = await this.validateAndUpdateStepOrder(existingDetail, approverLevel);

    // ตรวจสอบสิทธิ์การอนุมัติ (รวมถึงการอนุมัติแทน) - ใช้วิธีเดียวกับ controller
    const approvers = await UserService.getApproversForLevel(approverLevel, new Date());
    const approverIds = approvers.map(a => a.id);

    if (!approverIds.includes(approverId)) {
      throw createError(403, "คุณไม่มีสิทธิ์อนุมัติในระดับนี้");
    }

    // ดึงข้อมูล proxy approval สำหรับบันทึก (ถ้าเป็น proxy)
    const permission = await ProxyApprovalService.canUserApprove(approverId, approverLevel);

    // ตรวจสอบว่าเป็นการอนุมัติแทนหรือไม่
    let proxyApprovalId = null;

    if (permission.isProxy) {
      proxyApprovalId = permission.proxyApproval.id;
    }
    // หมายเหตุ: ไม่ต้องเช็คว่า existingDetail.approverId ตรงกับ approverId หรือไม่
    // เพราะถ้า user มีสิทธิ์ reject ในระดับนี้ (อยู่ใน verifierIds แล้ว) ก็ควรอนุญาตให้ reject ได้

    // 2. ใช้ Transaction: ปฏิเสธคำขอ + คืน balance ที่จองไว้ (pending) ให้ผู้ใช้
    //    (ทำให้สอดคล้องกับการปฏิเสธในระดับ approver อื่น ๆ ที่คืน balance ให้)
    const result = await prisma.$transaction(async (tx) => {
      const userId = existingDetail.leaveRequest.userId;
      const leaveTypeId = existingDetail.leaveRequest.leaveTypeId;
      const requestedDays = existingDetail.leaveRequest.thisTimeDays;

      console.log(`🔄 คืน balance (Verifier): User ${userId}, Type ${leaveTypeId}, Days ${requestedDays}`);

      // คืน days ใน userLeaveBalance (ปีปัจจุบัน)
      const currentYear = new Date().getFullYear();
      const balanceRecord = await tx.leaveBalance.findFirst({
        where: {
          AND: [{ userId }, { leaveTypeId }, { year: currentYear }],
        },
      });

      if (balanceRecord) {
        const newRemaining = (balanceRecord.remainingDays || 0) + requestedDays;
        const newPending = Math.max(0, (balanceRecord.pendingDays || 0) - requestedDays);

        await tx.leaveBalance.update({
          where: { id: balanceRecord.id },
          data: {
            remainingDays: newRemaining,
            pendingDays: newPending,
          },
        });
        console.log(`✅ Balance Updated Successfully (Verifier reject)`);
      } else {
        console.log(`❌ No Balance Record Found for User ${userId}, Type ${leaveTypeId}`);
      }

      // อัปเดตรายการคำขอลา
      const updatedDetail = await tx.leaveRequestDetail.update({
        where: { id: Number(id) },
        data: {
          approverId, // บันทึกว่าใครเป็นผู้อนุมัติจริง
          status: "REJECTED", // เปลี่ยนสถานะเป็น REJECTED
          reviewedAt: new Date(), // อัปเดตเวลา
          remarks,
          comment,
          proxyApprovalId, // บันทึกว่าเป็นการอนุมัติแทน (ถ้ามี)
        },
        include: {
          leaveRequest: true,
        },
      });

      // อัปเดตสถานะคำขอลาทั้งหมดเป็น REJECTED
      await tx.LeaveRequest.update({
        where: { id: updatedDetail.leaveRequestId },
        data: {
          status: "REJECTED",
        },
      });

      return updatedDetail;
    });

    // 3. ส่งอีเมลแจ้งเตือนให้ผู้ขออนุมัติ
    const requester = await prisma.user.findUnique({
      where: { id: result.leaveRequest.userId },
      select: {
        email: true,
        prefixName: true,
        firstName: true,
        lastName: true,
      },
    });

    if (requester.email) {
      const leaveInfo = await this.getLeaveEmailInfo(result.leaveRequestId);
      queueNotification("REJECTION", {
        ...leaveInfo,
        to: requester.email,
        userName: `${requester.prefixName} ${requester.firstName} ${requester.lastName}`,
        remarks,
      });
    }

    return {
      message: "รายการคำขอลาถูกปฏิเสธเรียบร้อย",
      rejectedDetail: result,
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
      },
    });
    if (!existingDetail) throw createError(404, "ไม่พบรายการคำขอลา");

    // อนุญาตให้ดำเนินการกับคำขอของตนเองได้ แต่บันทึกไว้ให้ตรวจสอบย้อนหลัง
    await this.logSelfReview(existingDetail.leaveRequestId, approverId, "approveBySecondApprover");

    // ตรวจสอบสถานะว่าต้องเป็น PENDING เท่านั้น
    if (existingDetail.status !== "PENDING") {
      throw createError(
        400,
        "รายการคำขอนี้ไม่อยู่ในสถานะรอดำเนินการ (PENDING)"
      );
    }

    // ตรวจสอบและอัปเดต stepOrder ให้ถูกต้อง
    const approverLevel = 3; // APPROVER_2
    const stepOrder = await this.validateAndUpdateStepOrder(existingDetail, approverLevel);

    // ตรวจสอบสิทธิ์การอนุมัติ (รวมถึงการอนุมัติแทน) - ใช้วิธีเดียวกับ controller
    const approvers = await UserService.getApproversForLevel(approverLevel, new Date());
    const approverIds = approvers.map(a => a.id);

    if (!approverIds.includes(approverId)) {
      throw createError(403, "คุณไม่มีสิทธิ์อนุมัติในระดับนี้");
    }

    // ดึงข้อมูล proxy approval สำหรับบันทึก (ถ้าเป็น proxy)
    const permission = await ProxyApprovalService.canUserApprove(approverId, approverLevel);

    // ตรวจสอบว่าเป็นการอนุมัติแทนหรือไม่
    let proxyApprovalId = null;

    if (permission.isProxy) {
      proxyApprovalId = permission.proxyApproval.id;
    }
    // หมายเหตุ: ไม่ต้องเช็คว่า existingDetail.approverId ตรงกับ approverId หรือไม่
    // เพราะถ้า user มีสิทธิ์ approve ในระดับนี้ (อยู่ใน approverIds แล้ว) ก็ควรอนุญาตให้ approve ได้

    // 2. อัปเดตรายการคำขอลา
    const updatedDetail = await prisma.$transaction(async (tx) => {
      const detail = await tx.leaveRequestDetail.update({
        where: { id: Number(id) },
        data: {
          approverId, // บันทึกว่าใครเป็นผู้อนุมัติจริง
          status: "APPROVED",
          reviewedAt: new Date(),
          remarks,
          comment,
          proxyApprovalId, // บันทึกว่าเป็นการอนุมัติแทน (ถ้ามี)
        },
        include: {
          leaveRequest: true,
        },
      });

      return detail;
    });

    // บันทึก log การทำงาน

    // 3. หา approver user
    const approver = await this.pickNextApprover(
      "APPROVER_3",
      updatedDetail.leaveRequestId
    );

    if (!approver)
      throw createError(404, "ไม่พบผู้อนุมัติ (APPROVER_3) ที่อนุมัติคำขอนี้ได้");

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

    const leaveInfo = await this.getLeaveEmailInfo(updatedDetail.leaveRequestId);

    if (approverUser.email) {
      queueNotification("APPROVER2_APPROVED", {
        ...leaveInfo,
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
      queueNotification("STEP_APPROVED_3", {
        ...leaveInfo,
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
        stepOrder: 4,
      },
      include: {
        leaveRequest: {
          include: {
            user: true,
            leaveType: true
          }
        }
      }
    });
    
    if (!existingDetail) throw createError(404, "ไม่พบรายการคำขอลา");

    // อนุญาตให้ดำเนินการกับคำขอของตนเองได้ แต่บันทึกไว้ให้ตรวจสอบย้อนหลัง
    await this.logSelfReview(existingDetail.leaveRequestId, approverId, "rejectBySecondApprover");

    // ตรวจสิทธิ์: ต้องถือบทบาทของขั้นนี้จริง
    await this.assertApproverPermission(3, approverId);

    // ตรวจสอบสถานะว่าต้องเป็น PENDING เท่านั้น
    if (existingDetail.status !== "PENDING") {
      throw createError(
        400,
        "รายการคำขอนี้ไม่อยู่ในสถานะรอดำเนินการ (PENDING)"
      );
    }

    // 🔥 ใช้ Transaction เพื่อความปลอดภัย
    const result = await prisma.$transaction(async (tx) => {
      const userId = existingDetail.leaveRequest.userId;
      const leaveTypeId = existingDetail.leaveRequest.leaveTypeId;
      const requestedDays = existingDetail.leaveRequest.thisTimeDays;
      
      console.log(`🔄 คืน balance (Second Approver): User ${userId}, Type ${leaveTypeId}, Days ${requestedDays}`);
      
      // คืน days ใน userLeaveBalance
      const currentYear = new Date().getFullYear();
      const balanceRecord = await tx.leaveBalance.findFirst({
        where: {
          AND: [
            { userId },
            { leaveTypeId },
            { year: currentYear } // 🎯 ค้นปีปัจจุบัน
          ]
        }
      });
      
      console.log(`🔍 Balance Record Found:`, balanceRecord);
      
      if (balanceRecord) {
        const currentRemaining = balanceRecord.remainingDays || 0;
        const currentPending = balanceRecord.pendingDays || 0;
        const newRemaining = currentRemaining + requestedDays;
        const newPending = Math.max(0, currentPending - requestedDays);
        
        console.log(`🔄 Balance Update:`, {
          currentRemaining,
          currentPending,
          requestedDays,
          newRemaining,
          newPending
        });
        
        await tx.leaveBalance.update({
          where: { id: balanceRecord.id },
          data: {
            remainingDays: newRemaining,
            pendingDays: newPending,
          },
        });
        
        console.log(`✅ Balance Updated Successfully`);
      } else {
        console.log(`❌ No Balance Record Found for User ${userId}, Type ${leaveTypeId}`);
      }

      // อัปเดตรายการคำขอลา
      const rejectedDetail = await tx.leaveRequestDetail.update({
        where: { id: Number(id) },
        data: {
          approverId,
          status: "REJECTED",
          reviewedAt: new Date(),
          remarks,
          comment,
        },
        include: {
          leaveRequest: true,
        },
      });

      await tx.LeaveRequest.update({
        where: { id: rejectedDetail.leaveRequestId },
        data: {
          status: "REJECTED",
        },
      });

      return rejectedDetail;
    });

    // บันทึก log การทำงาน

    // ส่งอีเมลแจ้งเตือนให้ผู้ขออนุมัติ
    const requester = await prisma.user.findUnique({
      where: { id: result.leaveRequest.userId },
      select: {
        email: true,
        prefixName: true,
        firstName: true,
        lastName: true,
      },
    });

    if (requester.email) {
      const leaveInfo = await this.getLeaveEmailInfo(result.leaveRequestId);
      queueNotification("REJECTION", {
        ...leaveInfo,
        to: requester.email,
        userName: `${requester.prefixName} ${requester.firstName} ${requester.lastName}`,
        remarks,
      });
    }

    return {
      message: "รายการคำขอลาถูกปฏิเสธเรียบร้อย",
      rejectedDetail: result,
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

    // อนุญาตให้ดำเนินการกับคำขอของตนเองได้ แต่บันทึกไว้ให้ตรวจสอบย้อนหลัง
    await this.logSelfReview(existingDetail.leaveRequestId, approverId, "approveByThirdApprover");

    // ตรวจสิทธิ์: ต้องถือบทบาทของขั้นนี้จริง
    await this.assertApproverPermission(4, approverId);

    // ตรวจสอบสถานะว่าต้องเป็น PENDING เท่านั้น
    if (existingDetail.status !== "PENDING") {
      throw createError(
        400,
        "รายการคำขอนี้ไม่อยู่ในสถานะรอดำเนินการ (PENDING)"
      );
    }

    // 2. อัปเดตรายการคำขอลา
    const updatedDetail = await prisma.$transaction(async (tx) => {
      const detail = await tx.leaveRequestDetail.update({
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

      return detail;
    });

    // บันทึก log การทำงาน

    // 3. หา approver user
    const approver = await this.pickNextApprover(
      "APPROVER_4",
      updatedDetail.leaveRequestId
    );

    if (!approver)
      throw createError(404, "ไม่พบผู้อนุมัติ (APPROVER_4) ที่อนุมัติคำขอนี้ได้");

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

    const leaveInfo = await this.getLeaveEmailInfo(updatedDetail.leaveRequestId);

    if (approverUser.email) {
      queueNotification("APPROVER3_APPROVED", {
        ...leaveInfo,
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
      queueNotification("STEP_APPROVED_4", {
        ...leaveInfo,
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
        stepOrder: 5,
      },
      include: {
        leaveRequest: {
          include: {
            user: true,
            leaveType: true
          }
        }
      }
    });
    
    if (!existingDetail) throw createError(404, "ไม่พบรายการคำขอลา");

    // อนุญาตให้ดำเนินการกับคำขอของตนเองได้ แต่บันทึกไว้ให้ตรวจสอบย้อนหลัง
    await this.logSelfReview(existingDetail.leaveRequestId, approverId, "rejectByThirdApprover");

    // ตรวจสิทธิ์: ต้องถือบทบาทของขั้นนี้จริง
    await this.assertApproverPermission(4, approverId);

    // ตรวจสอบสถานะว่าต้องเป็น PENDING เท่านั้น
    if (existingDetail.status !== "PENDING") {
      throw createError(
        400,
        "รายการคำขอนี้ไม่อยู่ในสถานะรอดำเนินการ (PENDING)"
      );
    }

    // 🔥 ใช้ Transaction เพื่อความปลอดภัย
    const result = await prisma.$transaction(async (tx) => {
      const userId = existingDetail.leaveRequest.userId;
      const leaveTypeId = existingDetail.leaveRequest.leaveTypeId;
      const requestedDays = existingDetail.leaveRequest.thisTimeDays;
      
      console.log(`🔄 คืน balance (Third Approver): User ${userId}, Type ${leaveTypeId}, Days ${requestedDays}`);
      
      // คืน days ใน userLeaveBalance
      const currentYear = new Date().getFullYear();
      const balanceRecord = await tx.leaveBalance.findFirst({
        where: {
          AND: [
            { userId },
            { leaveTypeId },
            { year: currentYear } // 🎯 ค้นปีปัจจุบัน
          ]
        }
      });
      
      console.log(`🔍 Balance Record Found:`, balanceRecord);
      
      if (balanceRecord) {
        const currentRemaining = balanceRecord.remainingDays || 0;
        const currentPending = balanceRecord.pendingDays || 0;
        const newRemaining = currentRemaining + requestedDays;
        const newPending = Math.max(0, currentPending - requestedDays);
        
        console.log(`🔄 Balance Update:`, {
          currentRemaining,
          currentPending,
          requestedDays,
          newRemaining,
          newPending
        });
        
        await tx.leaveBalance.update({
          where: { id: balanceRecord.id },
          data: {
            remainingDays: newRemaining,
            pendingDays: newPending,
          },
        });
        
        console.log(`✅ Balance Updated Successfully`);
      } else {
        console.log(`❌ No Balance Record Found for User ${userId}, Type ${leaveTypeId}`);
      }

      // อัปเดตรายการคำขอลา
      const rejectedDetail = await tx.leaveRequestDetail.update({
        where: { id: Number(id) },
        data: {
          approverId,
          status: "REJECTED",
          reviewedAt: new Date(),
          remarks,
          comment,
        },
        include: {
          leaveRequest: true,
        },
      });

      await tx.LeaveRequest.update({
        where: { id: rejectedDetail.leaveRequestId },
        data: {
          status: "REJECTED",
        },
      });

      return rejectedDetail;
    });

    // บันทึก log การทำงาน

    // ส่งอีเมลแจ้งเตือนให้ผู้ขออนุมัติ
    const requester = await prisma.user.findUnique({
      where: { id: result.leaveRequest.userId },
      select: {
        email: true,
        prefixName: true,
        firstName: true,
        lastName: true,
      },
    });

    if (requester.email) {
      const leaveInfo = await this.getLeaveEmailInfo(result.leaveRequestId);
      queueNotification("REJECTION", {
        ...leaveInfo,
        to: requester.email,
        userName: `${requester.prefixName} ${requester.firstName} ${requester.lastName}`,
        remarks,
      });
    }

    return {
      message: "รายการคำขอลาถูกปฏิเสธเรียบร้อย",
      rejectedDetail: result,
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

    // อนุญาตให้ดำเนินการกับคำขอของตนเองได้ แต่บันทึกไว้ให้ตรวจสอบย้อนหลัง
    await this.logSelfReview(existingDetail.leaveRequestId, approverId, "approveByFourthApprover");

    // ตรวจสิทธิ์: ต้องถือบทบาทของขั้นนี้จริง
    await this.assertApproverPermission(5, approverId);

    // ตรวจสอบสถานะว่าต้องเป็น PENDING เท่านั้น
    if (existingDetail.status !== "PENDING") {
      throw createError(
        400,
        "รายการคำขอนี้ไม่อยู่ในสถานะรอดำเนินการ (PENDING)"
      );
    }

    // 2. อัปเดตรายการคำขอลา
    const updatedDetail = await prisma.$transaction(async (tx) => {
      const detail = await tx.leaveRequestDetail.update({
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

      return detail;
    });

    // บันทึก log การทำงาน

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
      const leaveInfo = await this.getLeaveEmailInfo(updatedDetail.leaveRequestId);
      queueNotification("FULLY_APPROVED", {
        ...leaveInfo,
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
        stepOrder: 6,
      },
      include: {
        leaveRequest: {
          include: {
            user: true,
            leaveType: true
          }
        }
      }
    });
    
    if (!existingDetail) throw createError(404, "ไม่พบรายการคำขอลา");

    // อนุญาตให้ดำเนินการกับคำขอของตนเองได้ แต่บันทึกไว้ให้ตรวจสอบย้อนหลัง
    await this.logSelfReview(existingDetail.leaveRequestId, approverId, "rejectByFourthApprover");

    // ตรวจสิทธิ์: ต้องถือบทบาทของขั้นนี้จริง
    await this.assertApproverPermission(5, approverId);

    // ตรวจสอบสถานะว่าต้องเป็น PENDING เท่านั้น
    if (existingDetail.status !== "PENDING") {
      throw createError(
        400,
        "รายการคำขอนี้ไม่อยู่ในสถานะรอดำเนินการ (PENDING)"
      );
    }

    // 🔥 ใช้ Transaction เพื่อความปลอดภัย
    const result = await prisma.$transaction(async (tx) => {
      const userId = existingDetail.leaveRequest.userId;
      const leaveTypeId = existingDetail.leaveRequest.leaveTypeId;
      const requestedDays = existingDetail.leaveRequest.thisTimeDays;
      
      console.log(`🔄 คืน balance (Fourth Approver): User ${userId}, Type ${leaveTypeId}, Days ${requestedDays}`);
      
      // คืน days ใน userLeaveBalance
      const currentYear = new Date().getFullYear();
      const balanceRecord = await tx.leaveBalance.findFirst({
        where: {
          AND: [
            { userId },
            { leaveTypeId },
            { year: currentYear } // 🎯 ค้นปีปัจจุบัน
          ]
        }
      });
      
      console.log(`🔍 Balance Record Found:`, balanceRecord);
      
      if (balanceRecord) {
        const currentRemaining = balanceRecord.remainingDays || 0;
        const currentPending = balanceRecord.pendingDays || 0;
        const newRemaining = currentRemaining + requestedDays;
        const newPending = Math.max(0, currentPending - requestedDays);
        
        console.log(`🔄 Balance Update:`, {
          currentRemaining,
          currentPending,
          requestedDays,
          newRemaining,
          newPending
        });
        
        await tx.leaveBalance.update({
          where: { id: balanceRecord.id },
          data: {
            remainingDays: newRemaining,
            pendingDays: newPending,
          },
        });
        
        console.log(`✅ Balance Updated Successfully`);
      } else {
        console.log(`❌ No Balance Record Found for User ${userId}, Type ${leaveTypeId}`);
      }

      // อัปเดตรายการคำขอลา
      const rejectedDetail = await tx.leaveRequestDetail.update({
        where: { id: Number(id) },
        data: {
          approverId,
          status: "REJECTED",
          reviewedAt: new Date(),
          remarks,
          comment,
        },
        include: {
          leaveRequest: true,
        },
      });

      await tx.LeaveRequest.update({
        where: { id: rejectedDetail.leaveRequestId },
        data: {
          status: "REJECTED",
        },
      });

      return rejectedDetail;
    });

    // บันทึก log การทำงาน

    // ส่งอีเมลแจ้งเตือนให้ผู้ขออนุมัติ
    const requester = await prisma.user.findUnique({
      where: { id: result.leaveRequest.userId },
      select: {
        email: true,
        prefixName: true,
        firstName: true,
        lastName: true,
      },
    });

    if (requester.email) {
      const leaveInfo = await this.getLeaveEmailInfo(result.leaveRequestId);
      queueNotification("REJECTION", {
        ...leaveInfo,
        to: requester.email,
        userName: `${requester.prefixName} ${requester.firstName} ${requester.lastName}`,
        remarks,
      });
    }

    return {
      message: "รายการคำขอลาถูกปฏิเสธเรียบร้อย",
      rejectedDetail: result,
    };
  }

  static async getRecentLeaveBefore(userId, beforeDate) {
    const cutoff = new Date(beforeDate);
    if (Number.isNaN(cutoff.getTime())) throw createError(400, "beforeDate is invalid");

    return await prisma.leaveRequest.findMany({
      where: {
        userId: Number(userId),
        status: "APPROVED",
        startDate: { lte: cutoff },
      },
      orderBy: { startDate: "desc" },
      select: {
        id: true,
        leaveTypeId: true,
        leavedDays: true,
        totalDays: true,
        thisTimeDays: true,
      },
    });
  }

  // ────────────────────────────────
  // 🚫 ADMIN CANCEL LEAVE REQUEST
  // ────────────────────────────────

  static async adminCancelLeaveRequest(adminId, leaveRequestNumber, paperFileData) {
    // 1. ค้นหาคำขอลาจากเลขที่ใบลา (outside transaction for better performance)
    const leaveRequest = await prisma.leaveRequest.findFirst({
      where: {
        documentNumber: leaveRequestNumber,
        status: "APPROVED" // เฉพาะที่อนุมัติแล้วเท่านั้น
      },
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
        leaveType: {
          select: {
            id: true,
            name: true,
          },
        },
        leaveRequestDetails: {
          include: {
            approver: {
              select: {
                id: true,
                prefixName: true,
                firstName: true,
                lastName: true,
              },
            },
          },
        },
      },
    });

    if (!leaveRequest) {
      throw createError(404, "ไม่พบคำขอลาที่อนุมัติแล้ว หรือเลขที่ใบลาไม่ถูกต้อง");
    }

    // 2. ดำเนินการภายใน transaction (เฉพาะ database operations)
    const result = await prisma.$transaction(async (tx) => {
      // อัปเดตสถานะคำขอลาเป็น CANCELLED
      const updatedLeaveRequest = await tx.leaveRequest.update({
        where: { id: leaveRequest.id },
        data: {
          status: "CANCELLED",
          updatedAt: new Date(),
        },
      });

      // เพิ่ม record ใหม่ใน leaveRequestDetails ด้วยสถานะ CANCELLED
      await tx.leaveRequestDetail.create({
        data: {
          leaveRequestId: leaveRequest.id,
          approverId: adminId,
          stepOrder: 99, // ใช้ stepOrder พิเศษสำหรับการยกเลิก
          status: "CANCELLED",
          reviewedAt: new Date(),
          remarks: "ยกเลิกคำขอลาโดย admin",
        },
      });

      // คืนค่า leave balance ให้กับผู้ใช้
      const fiscalYearSetting = await tx.setting.findUnique({
        where: { key: "fiscalYear" },
        select: { value: true },
      });
      const fiscalYear = fiscalYearSetting
        ? Number.parseInt(fiscalYearSetting.value, 10)
        : new Date().getFullYear();

      const leaveBalance = await tx.leaveBalance.findFirst({
        where: {
          userId: leaveRequest.userId,
          leaveTypeId: leaveRequest.leaveTypeId,
          year: fiscalYear,
        },
      });

      let balanceUpdated = false;
      if (leaveBalance) {
        const newUsedDays = Math.max(0, leaveBalance.usedDays - leaveRequest.thisTimeDays);
        const newRemainingDays = leaveBalance.maxDays - newUsedDays;

        await tx.leaveBalance.update({
          where: { id: leaveBalance.id },
          data: {
            usedDays: newUsedDays,
            remainingDays: newRemainingDays,
            updatedAt: new Date(),
          },
        });
        balanceUpdated = true;
      }

      // แนบไฟล์ paper (ถ้ามี)
      if (paperFileData && paperFileData.length > 0) {
        const fileData = paperFileData.map(file => ({
          leaveRequestId: leaveRequest.id,
          type: "PAPER",
          filePath: file.filePath,
          name: file.name,
        }));
        await tx.file.createMany({ data: fileData });
      }

      return {
        updatedLeaveRequest,
        balanceUpdated,
        restoredDays: leaveRequest.thisTimeDays,
      };
    }, {
      timeout: 10000 // เพิ่ม timeout เป็น 10 วินาที
    });

    // 3. ส่งอีเมลแจ้งเตือนให้ผู้ใช้ (outside transaction)
    if (leaveRequest.user.email) {
      try {
        queueNotification("CANCELLATION", {
          to: leaveRequest.user.email,
          userName: `${leaveRequest.user.prefixName} ${leaveRequest.user.firstName} ${leaveRequest.user.lastName}`,
          documentNumber: leaveRequestNumber,
          leaveTypeName: leaveRequest.leaveType.name,
          requestedDays: leaveRequest.thisTimeDays,
          dateRange: `${leaveRequest.startDate.toLocaleDateString("th-TH")} - ${leaveRequest.endDate.toLocaleDateString("th-TH")}`,
        });
      } catch (emailError) {
        console.error("Failed to send cancellation email:", emailError);
        // ไม่ throw error เพราะการส่ง email ไม่ควรทำให้การยกเลิกล้มเหลว
      }
    }

    return {
      message: "ยกเลิกคำขอลาสำเร็จ",
      leaveRequest: result.updatedLeaveRequest,
      restoredDays: result.restoredDays,
      balanceUpdated: result.balanceUpdated,
    };
  }

  static async findLeaveRequestByNumber(leaveRequestNumber) {
    return await prisma.leaveRequest.findFirst({
      where: {
        documentNumber: leaveRequestNumber,
        status: "APPROVED"
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
        leaveType: {
          select: {
            id: true,
            name: true,
          },
        },
        files: {
          where: { type: "PAPER" },
        },
      },
    });
  }
}

module.exports = LeaveRequestService;
