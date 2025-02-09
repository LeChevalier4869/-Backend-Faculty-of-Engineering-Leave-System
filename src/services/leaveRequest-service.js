const prisma = require("../config/prisma");
const createError = require("../utils/createError");
const UserService = require("../services/user-service");
const LeaveTypeService = require("../services/leaveType-service");
const LeaveBalanceService = require("./leaveBalance-service");

// ในการ update leave request สามารถใช้ updateRequestStatus ได้แบบ Dynamics
// หรือ แยกแบบ approved or rejected ได้ที่ approved or rejected method

class LeaveRequestService {
  static async createRequest(
    userId,
    leaveTypeId,
    startDate,
    endDate,
    reason,
    isEmergency
  ) {
    //cal request day
    const requestDays =
      (new Date(endDate) - new Date(startDate)) / (1000 * 60 * 60 * 24) + 1;

    // query user and leave type
    const user = await UserService.getUserByIdWithRoles(userId);
    if (!user) {
      console.log(user);
      throw createError(404, "User not found");
    }

    const leaveType = await LeaveTypeService.getLeaveTypeByID(leaveTypeId);
    if (!leaveType) {
      console.log(leaveType);
      throw createError(404, "Leave type not found");
    }

    //check maxDays
    const personnelType = user.personnelTypeId.name;
    //let maxDays =

    // to-do here (conditions for leave) //not complete
    if (personnelType === "permanent") {
      // maxDays = 60;
      console.log("ประเภทบุคลากร", personnelType);
    } else if (personnelType === "government") {
      //maxDays = 30;
      console.log("ประเภทบุคลากร", personnelType);
    }

    // if (requestDays > maxDays) {
    //     throw createError(400, `Requested leave exceeds the maximum allowed days (${maxDays})`);
    // }

    await LeaveBalanceService.updatePendingLeaveBalance(
      userId,
      leaveTypeId,
      requestDays
    );

    const userDepartment = await prisma.user_department.findFirst({
      where: { userId: userId },
      select: { departmentId: true },
    });

    if (!userDepartment) throw createError(404, "User's department not found.");

    // 🔥 ดึงหัวหน้าสาขา
    const headOfDepartmentId = await UserService.getHeadOfDepartment(
      userDepartment.departmentId
    );
    if (!headOfDepartmentId)
      throw createError(500, "No head of department found.");

    const verifier = await UserService.getVerifier();
    const receiver = await UserService.getReceiver();

    if (!verifier) throw createError(500, "No verifier found in the system.");
    if (!receiver) throw createError(500, "No receiver found in the system.");
    //เช็คว่า verifierId และ receiverId มีอยู่จริง
    const verifierExists = await prisma.users.findUnique({
      where: { id: verifier },
    });
    if (!verifierExists)
      throw createError(500, "Verifier user does not exist.");

    const receiverExists = await prisma.users.findUnique({
      where: { id: receiver },
    });
    if (!receiverExists)
      throw createError(500, "Receiver user does not exist.");

    //create request
    const newRequest = await prisma.leaverequests.create({
      data: {
        userId,
        leaveTypeId: parseInt(leaveTypeId),
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        reason,
        isEmergency,
        status: "PENDING",
        verifierId: verifier.id, // บันทึกผู้ตรวจสอบ
        receiverId: receiver.id, // บันทึกผู้รับหนังสือ
      },
    });

    //สร้าง Approval Step 1 (ให้หัวหน้าสาขาอนุมัติเป็นคนแรก)
    await prisma.approvalsteps.create({
      data: {
        leaveRequestId: newRequest.id,
        approverId: headOfDepartmentId,
        stepOrder: 1,
        status: "PENDING",
      },
    });

    return newRequest;
  }
  static async updateRequestStatus(requestId, status, approverId) {
    try {
      const leaveRequest = await prisma.leaverequests.findUnique({
        where: { id: requestId },
      });

      if (!leaveRequest) {
        throw new Error("Leave request not found");
      }

      const currentStep = await prisma.approvalsteps.findFirst({
        where: {
          leaveRequestId: requestId,
          approverId: approverId,
        },
        orderBy: { stepOrder: "asc" },
      });

      if (!currentStep) {
        throw new Error("No approval step found this approver.");
      }

      if (currentStep.stepOrder === 1 && status === "APPROVED") {
        //ถ้า Approver A อนุมัติ → ส่งต่อให้ผู้ตรวจสอบ
        await prisma.leaverequests.update({
          where: { id: requestId },
          data: { status: "WAITING_FOR_VERIFICATION" },
        });
      } else if (
        leaveRequest.status === "WAITING_FOR_VERIFICATION" &&
        leaveRequest.documentNumber
      ) {
        //ถ้าผู้ตรวจสอบออกเอกสารแล้ว → ส่งต่อให้ผู้รับหนังสือ
        await prisma.leaverequests.update({
          where: { id: requestId },
          data: { status: "WAITING_FOR_RECEIVER" },
        });
      } else if (leaveRequest.status === "WAITING_FOR_RECEIVER") {
        //ถ้าผู้รับหนังสือตรวจสอบเสร็จ → ส่งให้ Approver B
        await prisma.approvalsteps.updateMany({
          where: {
            leaveRequestId: requestId,
            stepOrder: currentStep.stepOrder + 1,
          },
          data: { status: "PENDING" },
        });
      }

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
          throw new Error("You cannot approve before the previous approver.");
        }
      }

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
        },
      });

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

      const nextStep = await prisma.approvalsteps.findFirst({
        where: {
          leaveRequestId: requestId,
          stepOrder: currentStep.stepOrder + 1,
        },
      });

      if (status === "APPROVED") {
        if (nextStep) {
          // อัปเดตผู้อนุมัติถัดไปให้เป็น "PENDING"
          await prisma.approvalsteps.update({
            where: { id: nextStep.id },
            data: { status: "PENDING" },
          });
        } else {
          // อนุมัติครบ 4 ระดับ → อัปเดตคำขอลาเป็น "APPROVED"
          await prisma.leaverequests.update({
            where: { id: requestId },
            data: { status: "APPROVED" },
          });

          await LeaveBalanceService.finalizeLeaveBalance(
            leaveRequest.userId,
            leaveRequest.leaveTypeId,
            (new Date(leaveRequest.endDate) -
              new Date(leaveRequest.startDate)) /
              (1000 * 60 * 60 * 24) +
              1
          );
        }
      } else if (status === "REJECTED") {
        // ถ้า Reject ให้คำขอลากลับเป็น "PENDING"
        await prisma.leaverequests.update({
          where: { id: requestId },
          data: { status: "PENDING" },
        });

        // รีเซ็ต Approval Steps
        await prisma.approvalsteps.updateMany({
          where: { leaveRequestId: requestId },
          data: { status: "PENDING" },
        });
      }

      return { message: "Request status updated" };
    } catch (error) {
      throw new Error(`Failed to update request status: ${error.message}`);
    }
  }
  static async getRequests(whereCondition) {
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
            maxDays: true,
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
          }
        },
        receiver: {
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
  static async getRequestsById(requestId) {
    return await prisma.leaverequests.findUnique({
      where: { id: parseInt(requestId) },
      include: {
        verifier: {
          select: {
            prefixName: true,
            firstName: true,
            lastName: true,
            email: true,
          }
        },
        receiver: {
          select: {
            prefixName: true,
            firstName: true,
            lastName: true,
            email: true,
          }
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
            maxDays: true,
          },
        },
        approvalsteps: {
          select: {
            stepOrder: true,
            status: true,
            approverId: true,
          },
        },
      }
    });
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
      const leaveRequest = await prisma.leaverequests.findUnique({
        where: {
          id: requestId,
        },
      });

      if (!leaveRequest) {
        return null;
      }

      await prisma.leaverequests.delete({
        where: { id: requestId },
      });

      return true;
    } catch (err) {
      throw new Error("Error to delete leave request");
    }
  }
  static async getLanding() {
    try {
      return await prisma.leaverequests.findMany({
        where: {
          status: "PENDING",
        },
        include: {
          leavetypes: true,
          leavebalances: true,
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
            },
          },
        },
      });
    } catch (err) {
      throw new Error("Leave requests not found");
    }
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
}

module.exports = LeaveRequestService;
