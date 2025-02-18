const LeaveRequestService = require("../services/leaveRequest-service");
const LeaveBalanceService = require("../services/leaveBalance-service");
const AuditLogService = require("../services/auditLog-service");
const RoleAssignmentService = require("../services/roleAssignment-service");
const createError = require("../utils/createError");
const multer = require("multer");
const cloudUpload = require("../utils/cloudUpload");
const UserService = require("../services/user-service");
const upload = multer();
const { sendEmail, sendNotification } = require("../utils/emailService");
const { checkLeaveEligibility } = require("../utils/checkLeaveEligibility");

exports.createLeaveRequest = async (req, res, next) => {
  try {
    const { leaveTypeId, startDate, endDate, reason, isEmergency } = req.body;
    // console.log("req.user.id = ", req.user.id);
    // console.log("Debug leaveTypeId con: ", leaveTypeId);
    // console.log("Debug req.user.id con: ", req.user.id);

    if (!leaveTypeId || !startDate || !endDate) {
      throw createError(
        400,
        "กรุณาเลือกวันที่เริ่มและวันที่สิ้นสุดและ leave type"
      );
    }

    const start = new Date(startDate);
    const end = new Date(endDate);

    // Validation: startDate ต้องไม่มากกว่า endDate
    if (start > end) {
      throw createError(400, "วันที่เริ่มต้องไม่มากกว่าวันที่สิ้นสุด");
    }

    const leaveBalance = await LeaveBalanceService.getUserBalance(
      req.user.id,
      leaveTypeId
    );

    // console.log("Debug leaveBalance: ", leaveBalance);
    const requestedDays = Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1;
    if (requestedDays <= 0) {
      throw createError(400, "จำนวนวันลาต้องมากกว่า 0");
    }
    if (requestedDays > leaveBalance.maxDays - leaveBalance.usedDays) {
      return createError(400, "Leave balance is not enough");
    }

    if (!leaveBalance) {
      throw createError(404, `Leave balance not found`);
    }

    //console.log(req.body);

    // ตรวจสอบสิทธิ์ลา
    const eligibility = await LeaveRequestService.checkEligibility(
      req.user.id,
      leaveTypeId,
      requestedDays
    );

    if (!eligibility.success) {
      throw createError(400, eligibility.message);
    }

    const leaveRequest = await LeaveRequestService.createRequest(
      req.user.id,
      leaveTypeId,
      startDate,
      endDate,
      reason,
      isEmergency
    );

    await LeaveBalanceService.updatePendingLeaveBalance(
      req.user.id,
      leaveTypeId,
      requestedDays
    );
    // create log
    await AuditLogService.createLog(
      req.user.id,
      "Create Request",
      leaveRequest.id,
      `คำขอถูกสร้าง: ${reason} , ฉุกเฉิน: ${req.body.isEmergency}`,
      "LEAVE_REQUEST"
    );

    //sent email ตัวเอง สำหรับ การแจ้งเตือน create request
    const user = await UserService.getUserByIdWithRoles(req.user.id);

    if (user) {
      const userEmail = user.email;
      const userName = `${user.prefixName} ${user.firstName} ${user.lastName}`;

      const subject = "ยืนยันการยื่นคำขอลา";
      const message = `
              <h3>สวัสดี ${userName}</h3>
              <p>คุณได้ทำการยื่นคำขอลาเรียบร้อยแล้ว</p>
              <p>จำนวนวันลา: ${requestedDays}</p>
              <br/>
              <p>ระบบจัดการวันลาคณะวิศวกรรมศาสตร์</p>
          `;
      await sendEmail(userEmail, subject, message);
    }

    // ดึง assignment สำหรับ APPROVER_1 ในวันนั้น
    const assignmentApprover1 = await RoleAssignmentService.getAssignment(
      "APPROVER_1"
    );
    if (assignmentApprover1 && assignmentApprover1.user) {
      await sendNotification("SUBMISSION", {
        to: assignmentApprover1.user.email,
        approverName: `${assignmentApprover1.user.prefixName} ${assignmentApprover1.user.firstName} ${assignmentApprover1.user.lastName}`,
        userName: `${req.user.prefixName} ${req.user.firstName} ${req.user.lastName}`,
      });
    }

    const file = req.files;
    if (file && file.length > 0) {
      const imagesPromiseArray = file.map((file) => {
        return cloudUpload(file.path);
      });

      const imgUrlArray = await Promise.all(imagesPromiseArray);

      const attachImages = imgUrlArray.map((imgUrl) => {
        return {
          fileName: "attachment",
          filePath: imgUrl,
          leaveRequestId: leaveRequest.id,
        };
      });

      LeaveRequestService.attachImages(attachImages);
    }
    //   const newLeaveRequest = await prisma.leaverequests.findFirst({
    //     where: {
    //       id: leaveRequest.id,
    //     },
    //     include: {
    //       attachments: true,
    //     },
    //   });
    //   res.json({ newLeaveRequest });
    // }

    res
      .status(201)
      .json({ message: "คำขอลาได้ถูกสร้าง", requestId: leaveRequest.id });
  } catch (err) {
    next(err);
  }
};

//use (not mail)
exports.updateLeaveStatus = async (req, res, next) => {
  try {
    const requestId = parseInt(req.params.id);
    const { status, remarks, documentNumber } = req.body;
    const approverId = req.user.id;

    if (!["APPROVED", "REJECTED"].includes(status)) {
      throw createError(400, "สถานะไม่ถูกต้อง");
    }

    const updatedStatus = await LeaveRequestService.updateRequestStatus(
      requestId,
      status,
      approverId,
      remarks,
      documentNumber
    );
    await AuditLogService.createLog(
      req.user.id,
      "Update Status",
      requestId,
      `สถานะเปลี่ยนเป็น: ${status}${
        remarks ? " เหตุผล: " + remarks : ""
      }`,
      status === "REJECTED" ? "REJECTION" : "APPROVAL"
    );
    res
      .status(200)
      .json({ message: "สถานะคำขอลาถูกอัปเดต", data: updatedStatus });
  } catch (err) {
    next(err);
  }
};

exports.getLeaveRequest = async (req, res, next) => {
  try {
    const requestId = parseInt(req.params.id);
    console.log("Debug requestId11:", requestId);
    const user = req.user;
    // console.log(user)
    // console.log("Debug user.departmentId",user.department.id);

    // if (!requestId || isNaN(requestId)) {
    //   console.log("Debug requestId: ", requestId);
    //   throw createError(400, "Invalid request ID.");
    // }

    //const role = req.user.role;

    //const whereCondition = {};

    // if (requestId) {
    //   whereCondition.id = parseInt(requestId);
    // }
    // if (role === "USER" && !requestId) {
    //   whereCondition.userId = req.user.id;
    // } else if (role === "APPROVER" && !requestId) {
    //   whereCondition.ApprovalSteps = {
    //     some: {
    //       approverId: req.user.id,
    //     },
    //   };
    // } else if (role === "ADMIN" && userId) {
    //   whereCondition.userId = parseInt(userId);
    // }

    // const leaveRequests = await LeaveRequestService.getRequests(whereCondition);
    const leaveRequests = await LeaveRequestService.getRequestsById(requestId);
    // console.log("Debug leaveRequest: ", leaveRequests);
    if (!leaveRequests) {
      throw createError(404, "Leave request not found");
    }

    if (!user.department.id) {
      throw createError(400, "User has no department assigned.");
    }

    // ค้นหาหัวหน้าสาขาของคำขอลานี้
    const headDepartment = await UserService.getHeadOfDepartment(
      user.department.id
    );
    // console.log('Debug headDepartment: ', headDepartment);
    const approvalSteps = await LeaveRequestService.getApprovalSteps(requestId);

    res.status(200).json({
      message: "Leave requests retrieved",
      data: {
        ...leaveRequests[0],
        headOfDepartment: headDepartment
          ? await UserService.getUserByIdWithRoles(headDepartment)
          : null,
        verifier: await UserService.getUserByIdWithRoles(
          leaveRequests[0].verifierId
        ),
        receiver: await UserService.getUserByIdWithRoles(
          leaveRequests[0].receiverId
        ),
        approvalSteps,
      },
    });
  } catch (err) {
    next(err);
  }
};

exports.getLeaveRequestIsMine = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const leaveRequests = await LeaveRequestService.getRequestIsMine(userId);

    if (!leaveRequests) {
      throw createError(404, "Leave request not found");
    }

    res.status(200).json({
      message: "Leave request retrieved",
      data: leaveRequests,
    });
  } catch (err) {
    next(err);
  }
};

exports.updateLeaveRequest = async (req, res, next) => {
  const leaveRequestId = req.params.id;
  const updateData = req.body;
  try {
    const leaveRequest = await LeaveRequestService.getRequestsById(
      leaveRequestId
    );
    if (!leaveRequest) {
      throw createError(404, "Leave request not found");
    }
    if (leaveRequest.userId !== req.user.id) {
      throw createError(403, "You are not allowed to update");
    }

    const updateRequest = await LeaveRequestService.updateRequest(
      leaveRequestId,
      updateData
    );
    res.status(200).json({
      message: "Leave request updated",
      data: updateRequest,
    });
  } catch (err) {
    next(err);
  }
};

exports.approveLeaveRequest = async (req, res, next) => {
  try {
    const leaveRequestId = parseInt(req.params.id);
    const approverId = req.user.id;

    const updatedLeaveRequest = await LeaveRequestService.approveRequest(
      leaveRequestId,
      approverId
    );

    res.status(200).json({
      message: "Leave request approved",
      leaveRequestId: updatedLeaveRequest,
    });
  } catch (err) {
    next(err);
  }
};

exports.rejectLeaveRequest = async (req, res, next) => {
  try {
    const leaveRequestId = parseInt(req.params.id);
    const { remarks } = req.body;
    const approverId = req.user.id;

    const updatedLeaveRequest = await LeaveRequestService.rejectRequest(
      leaveRequestId,
      remarks,
      approverId
    );

    res.status(200).json({
      message: "Leave request rejected",
      leaveRequest: updatedLeaveRequest,
    });
  } catch (err) {
    next(err);
  }
};

exports.deleteLeaveRequest = async (req, res, next) => {
  const leaveRequestId = parseInt(req.params.id);

  try {
    const result = await LeaveRequestService.deleteRequest(leaveRequestId);

    if (!result) {
      return createError(404, "Leave request not found");
    }

    res.status(200).json({ message: "Leave request deleted" });
  } catch (err) {
    next(err);
  }
};

exports.getLeaveRequestLanding = async (req, res, next) => {
  try {
    const leaveRequest = await LeaveRequestService.getLanding();
    if (!leaveRequest) {
      throw createError(404, "Leave request not found");
    }
    res.status(200).json({ leaveRequest });
  } catch (err) {
    next(err);
  }
};
