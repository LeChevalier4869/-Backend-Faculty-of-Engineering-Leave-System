const LeaveRequestService = require("../services/leaveRequest-service");
const LeaveBalanceService = require("../services/leaveBalance-service");
const AuditLogService = require("../services/auditLog-service");
const createError = require("../utils/createError");
const multer = require("multer");
const cloudUpload = require("../utils/cloudUpload");
const UserService = require("../services/user-service");
const upload = multer();
const { sendEmail } = require("../utils/emailService");

exports.createLeaveRequest = async (req, res, next) => {
  try {
    const { leaveTypeId, startDate, endDate, reason, isEmergency } = req.body;
    // console.log("req.user.id = ", req.user.id);
    // console.log("Debug leaveTypeId con: ", leaveTypeId);
    // console.log("Debug req.user.id con: ", req.user.id);

    if (!startDate || !endDate) {
      throw createError(400, "กรุณาเลือกวันที่เริ่มและวันที่สิ้นสุด");
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
    const requestedDays =
      (new Date(endDate) - new Date(startDate)) / (1000 * 60 * 60 * 24) + 1;
    if (requestedDays > leaveBalance.maxDays - leaveBalance.usedDays) {
      return createError(400, "Leave balance is not enough");
    }

    if (!leaveBalance) {
      throw createError(404, `Leave balance not found`);
    }

    console.log(req.body);

    if (!leaveTypeId) {
      throw createError(400, "Leave type ID is required");
    }

    const leaveRequest = await LeaveRequestService.createRequest(
      req.user.id,
      leaveTypeId,
      startDate,
      endDate,
      reason,
      isEmergency
    );

    await LeaveBalanceService.updateLeaveBalance(
      req.user.id,
      leaveTypeId,
      requestedDays
    );
    // create log
    await AuditLogService.createLog(
      req.user.id,
      "Create Request",
      leaveRequest.id,
      `Leave created: ${reason} , isEemergency: ${req.body.isEmergency}`,
      "LEAVE_REQUEST"
    );

    //sent email ตัวเอง สำหรับ การแจ้งเตือน create request
    const user = await UserService.getUserByIdWithRoles(req.user.id);

    if (user) {
      const userEmail = user.email;
      const userName = `${user.prefixName} ${user.firstName} ${user.lastName}`;

      const subject = "บทบาทของคุณได้รับการอัพเดตแล้ว!";
      const message = `
              <h3>สวัสดี ${userName}</h3>
              <p>บทบาทของคุณได้รับการอัพเดตแล้ว</p>

              <br/>
              <p>ขอแสดงความนับถือ</p>
              <p>ระบบจัดการวันลาคณะวิศวกรรมศาสตร์</p>
          `;
      await sendEmail(userEmail, subject, message);
    }

    const file = req.files;
    if (file) {
      const imagesPromiseArray = file.map((file) => {
        return cloudUpload(file.path);
      });

      const imgUrlArray = await Promise.all(imagesPromiseArray);

      const attachImages = imgUrlArray.map((imgUrl) => {
        return {
          fileName: "test",
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
      .json({ message: "Leave request created", requestId: leaveRequest.id });
  } catch (err) {
    next(err);
  }
};

//use
exports.updateLeaveStatus = async (req, res, next) => {
  try {
    const { requestId, status } = req.body;
    const approverId = req.user.id;
    await LeaveRequestService.updateRequestStatus(
      requestId,
      status,
      approverId
    );
    await AuditLogService.createLog(
      req.user.id,
      "Update Status",
      requestId,
      `Status updated to: ${status}`
    );
    res.status(200).json({ message: "Leave status updated" });
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
    const headDepartment = await UserService.getHeadOfDepartment(user.department.id);
    // console.log('Debug headDepartment: ', headDepartment);
    const approvalSteps = await LeaveRequestService.getApprovalSteps(requestId);

    res.status(200).json({
      message: "Leave requests retrieved",
      data: {
        ...leaveRequests[0],
        headOfDepartment: headDepartment
          ? await UserService.getUserByIdWithRoles(headDepartment)
          : null,
        verifier: await UserService.getUserByIdWithRoles(leaveRequests[0].verifierId),
        receiver: await UserService.getUserByIdWithRoles(leaveRequests[0].receiverId),
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
