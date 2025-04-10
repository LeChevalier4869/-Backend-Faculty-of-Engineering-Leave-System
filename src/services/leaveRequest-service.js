const prisma = require("../config/prisma");
const createError = require("../utils/createError");
const UserService = require("../services/user-service");
const LeaveTypeService = require("../services/leaveType-service");
const LeaveBalanceService = require("./leaveBalance-service");
const RoleAssignmentService = require("./roleAssignment-service");
const { checkLeaveEligibility } = require("../utils/checkLeaveEligibility");
const { sendNotification } = require("../utils/emailService");

// ในการ update leave request สามารถใช้ updateRequestStatus ได้แบบ Dynamics
// หรือ แยกแบบ approved or rejected ได้ที่ approved or rejected method

/** Descriptions
 * LeaveRequestService - บริการจัดการคำขอลา
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
  static async checkEligibility(userId, leaveTypeId, requestDays) {
    const result = await checkLeaveEligibility(
      userId,
      leaveTypeId,
      requestDays
    );
    return result;
  }
  static async createRequest(
    userId,
    leaveTypeId,
    startDate,
    endDate,
    reason,
    isEmergency,
    requestDays
  ) {
    if (!userId || !leaveTypeId || !startDate || !endDate) {
      throw createError(400, "Missing required fields.");
    }

    //ตรวจสอบสิทธิ์ก่อน ทำเพื่อเอา department id เฉยๆ
    const eligibility = await this.checkEligibility(
      userId,
      leaveTypeId,
      requestDays
    );

    // console.log("Debug eligibility id: ", eligibility.departmentId.departmentId);

    if (!eligibility.success) throw createError(400, eligibility.message);

    //Get department head, verifier, and receiver
    const userDepartment = await prisma.departments.findUnique({
      where: { id: eligibility.departmentId.departmentId },
      select: { isHeadId: true },
    });

    if (!userDepartment || !userDepartment.isHeadId) {
      throw createError(500, "Department head not found.");
    }

    const verifier = await UserService.getVerifier();
    const receiver = await UserService.getReceiver();

    if (!verifier || !receiver) {
      throw createError(500, "ไม่พบผู้ตรวจสอบหรือผู้รับหนังสือ");
    }
    //เช็คว่า verifierId และ receiverId มีอยู่จริง
    const verifierExists = await prisma.users.findUnique({
      where: { id: verifier },
    });
    if (!verifierExists) throw createError(500, "ไม่มีผู้ตรวจสอบ");

    const receiverExists = await prisma.users.findUnique({
      where: { id: receiver },
    });
    if (!receiverExists) throw createError(500, "ไม่มีผู้รับหนังสือ");

    //create request
    const newRequest = await prisma.leaverequests.create({
      data: {
        userId,
        leaveTypeId: parseInt(leaveTypeId),
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        reason,
        isEmergency: Boolean(isEmergency),
        status: "PENDING",
        verifierId: verifier, // บันทึกผู้ตรวจสอบ
        receiverId: receiver, // บันทึกผู้รับหนังสือ
      },
    });

    //สร้าง Approval Step 1 (ให้หัวหน้าสาขาอนุมัติเป็นคนแรก)
    await prisma.approvalsteps.create({
      data: {
        leaveRequestId: newRequest.id,
        approverId: userDepartment.isHeadId,
        stepOrder: 1,
        status: "PENDING",
      },
    });

    return newRequest;
  }
  // add logic
  static async updateRequestStatus(
    requestId,
    status,
    approverId,
    remarks = null,
    documentNumber = null
  ) {
    const leaveRequest = await prisma.leaverequests.findUnique({
      where: { id: requestId },
      include: { approvalsteps: true },
    });

    if (!leaveRequest) {
      throw createError(404, "ไม่พบคำขอลา");
    }

    const currentStep = await prisma.approvalsteps.findFirst({
      where: {
        leaveRequestId: requestId,
        approverId: approverId,
      },
      orderBy: { stepOrder: "asc" },
    });

    if (!currentStep) {
      throw createError(403, "คุณไม่มีสิทธิ์อัปเดตสถานะในขั้นตอนนี้");
    }

    // if (currentStep.stepOrder === 1 && status === "APPROVED") {
    //   //ถ้า Approver A อนุมัติ → ส่งต่อให้ผู้ตรวจสอบ
    //   await prisma.leaverequests.update({
    //     where: { id: requestId },
    //     data: { status: "WAITING_FOR_VERIFICATION" },
    //   });
    // } else if (
    //   leaveRequest.status === "WAITING_FOR_VERIFICATION" &&
    //   leaveRequest.documentNumber
    // ) {
    //   //ถ้าผู้ตรวจสอบออกเอกสารแล้ว → ส่งต่อให้ผู้รับหนังสือ
    //   await prisma.leaverequests.update({
    //     where: { id: requestId },
    //     data: { status: "WAITING_FOR_RECEIVER" },
    //   });
    // } else if (leaveRequest.status === "WAITING_FOR_RECEIVER") {
    //   //ถ้าผู้รับหนังสือตรวจสอบเสร็จ → ส่งให้ Approver B
    //   await prisma.approvalsteps.updateMany({
    //     where: {
    //       leaveRequestId: requestId,
    //       stepOrder: currentStep.stepOrder + 1,
    //     },
    //     data: { status: "PENDING" },
    //   });
    // }

    // ตรวจสอบว่าผู้อนุมัติก่อนหน้าอนุมัติแล้วหรือไม่
    if (currentStep.stepOrder > 1) {
      const previousStep = await prisma.approvalsteps.findFirst({
        where: {
          leaveRequestId: requestId,
          stepOrder: currentStep.stepOrder - 1,
          status: "APPROVED",
        },
      });

      if (!previousStep) {
        throw createError(
          400,
          "ไม่สามารถอนุมัติก่อนที่ขั้นตอนก่อนหน้าจะอนุมัติแล้ว"
        );
      }
    }

    await prisma.leaverequests.update({
      where: { id: requestId },
      data: { status: "APPROVED" },
    });

    //   const approvalSteps = await prisma.approvalsteps.count({
    //     where: { leaveRequestId: requestId },
    //   });

    //   const stepOrder = currentStep + 1;

    if (!["PENDING", "APPROVED", "REJECTED"].includes(status)) {
      throw new Error("Invalid status");
    }

    //   await prisma.approvalsteps.create({
    //     data: {
    //       leaveRequestId: requestId,
    //       approverId: approverId,
    //       stepOrder: approvalSteps + 1, // คุณสามารถปรับ stepOrder ตามลำดับขั้นตอน
    //       status: status, // เช่น 'APPROVED',
    //       reviewedAt: new Date(),
    //     },
    //   });
    await prisma.approvalsteps.update({
      where: { id: currentStep.id },
      data: {
        status: status, // เช่น 'APPROVED',
        reviewedAt: new Date(),
        previousApproved: status === "APPROVED",
        remarks: remarks ? String(remarks) : null,
      },
    });

    // กำหนด mapping ระหว่างขั้นตอนกับ role ถัดไป
    const roleMapping = {
      1: "VERIFIER", // หลัง APPROVER_1
      2: "RECEIVER", // หลัง Verifier
      3: "APPROVER_2", // หลัง Receiver
      4: "APPROVER_3", // หลัง Approver_2
      5: "APPROVER_4", // หลัง Approver_3
      // เมื่อขั้นตอนเป็น 6 (APPROVER_4) ไม่มีขั้นตอนถัดไป
    };

    // เช็คว่าผ่านครบ 4 ระดับหรือยัง
    //   if (approvalSteps + 1 === 4 && status === "APPROVED") {
    //     await LeaveBalanceService.finalizeLeaveBalance(
    //       leaveRequest.userId,
    //       leaveRequest.leaveTypeId,
    //       (new Date(leaveRequest.endDate) - new Date(leaveRequest.startDate)) /
    //         (1000 * 60 * 60 * 24) +
    //         1
    //     );
    //   }

    // const approver = await prisma.users.findFirst({
    //   where: { id: approverId },
    //   select: {
    //     user_role: {
    //       select: {
    //         roles: {
    //           select: {
    //             name: true,
    //           },
    //         },
    //       },
    //     },
    //   },
    // });

    // if (!approver) {
    //   console.log("Debug approverRole: ", approver);
    // }

    // ออกเลขที่เอกสารและวันที่ออกหนังสือ หากเป็น Receiver
    // if (status === "APPROVED" && documentNumber) {
    //   await prisma.leaverequests.update({
    //     where: { id: requestId },
    //     data: {
    //       documentNumber,
    //       documentIssuedDate: new Date(),
    //     },
    //   });
    // }

    // if (status === "APPROVED") {
    //   const nextStep = await prisma.approvalsteps.findFirst({
    //     where: {
    //       leaveRequestId: requestId,
    //       stepOrder: currentStep.stepOrder + 1,
    //     },
    //   });
    //   if (nextStep) {
    //     // อัปเดตผู้อนุมัติถัดไปให้เป็น "PENDING"
    //     await prisma.approvalsteps.update({
    //       where: { id: nextStep.id },
    //       data: { status: "PENDING" },
    //     });
    //     // ส่ง email แจ้งเตือนให้กับ role ถัดไป ตาม dynamic assignment
    //     const nextRole = roleMapping[currentStep.stepOrder];
    //     if (nextRole) {
    //       const assignment = await RoleAssignmentService.getAssignment(
    //         nextRole
    //       );
    //       const user = await UserService.getUserByIdWithRoles(
    //         leaveRequest.userId
    //       );
    //       const fullName = `${user.prefixName} ${user.firstName} ${user.lastName}`;
    //       if (assignment && assignment.user) {
    //         await sendNotification(getNotificationKey(nextRole), {
    //           to: assignment.user.email,
    //           // สมมุติว่าฟังก์ชัน getUserById ดึงชื่อผู้ยื่นลาได้
    //           userName: fullName,
    //         });
    //       }
    //     }
    //   } else {
    //     // อนุมัติครบ 4 ระดับ → อัปเดตคำขอลาเป็น "APPROVED"
    //     await prisma.leaverequests.update({
    //       where: { id: requestId },
    //       data: { status: "APPROVED" },
    //     });

    //     const reqDays =
    //       Math.ceil(
    //         (new Date(leaveRequest.endDate) -
    //           new Date(leaveRequest.startDate)) /
    //           (1000 * 60 * 60 * 24)
    //       ) + 1;
    //     await LeaveBalanceService.finalizeLeaveBalance(
    //       leaveRequest.userId,
    //       leaveRequest.leaveTypeId,
    //       reqDays
    //     );
    //     // ส่ง email แจ้งเตือนให้กับผู้ยื่นคำขอ
    //     const user = await UserService.getUserByIdWithRoles(
    //       leaveRequest.userId
    //     );
    //     const fullName = `${user.prefixName} ${user.firstName} ${user.lastName}`;
    //     if (user && user.email) {
    //       await sendNotification("FULLY_APPROVED", {
    //         to: user.email,
    //         userName: fullName,
    //       });
    //     }
    //   }
    // } else if (status === "REJECTED") {
    //   // ถ้า Reject ให้คำขอลากลับเป็น "PENDING"
    //   await prisma.leaverequests.update({
    //     where: { id: requestId },
    //     data: { status: "REJECTED" },
    //   });

    //   // รีเซ็ต Approval Steps
    //   await prisma.approvalsteps.updateMany({
    //     where: { leaveRequestId: requestId },
    //     data: { status: "REJECTED" },
    //   });

    //   // ส่ง email แจ้งเตือนให้กับผู้ยื่นคำขอว่า ถูกปฏิเสธ
    //   const user = await UserService.getUserByIdWithRoles(leaveRequest.userId);
    //   const fullName = `${user.prefixName} ${user.firstName} ${user.lastName}`;
    //   if (user && user.email) {
    //     await sendNotification("REJECTION", {
    //       to: user.email,
    //       userName: fullName,
    //       remarks,
    //     });
    //   }
    // }

    return { message: "สถานะคำขอลาได้รับการอัปเดตแล้ว" };
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
