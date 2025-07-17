const LeaveRequestService = require("../services/leaveRequest-service");
const LeaveBalanceService = require("../services/leaveBalance-service");
const AuditLogService = require("../services/auditLog-service");
//const RoleAssignmentService = require("../services/roleAssignment-service");
const createError = require("../utils/createError");
const multer = require("multer");
const cloudUpload = require("../utils/cloudUpload");
const UserService = require("../services/user-service");
const upload = multer();
const { sendEmail, sendNotification } = require("../utils/emailService");
const { calculateWorkingDays } = require("../utils/dateCalculate");

exports.createLeaveRequest = async (req, res, next) => {
  try {
    const { leaveTypeId, startDate, endDate, reason, contact } = req.body;
    console.log("req.user.id = ", req.user);
    // console.log("Debug leaveTypeId con: ", leaveTypeId);
    // console.log("Debug req.user.id con: ", req.user.id);

    if (!leaveTypeId || !startDate || !endDate) {
      console.log(
        "Debug createRequest leaveType, start, end",
        leaveTypeId,
        startDate,
        endDate
      );
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

    const requestedDays = Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1;
    // const requestedDays = await calculateWorkingDays(start, end);

    if (requestedDays <= 0) {
      throw createError(400, "จำนวนวันลาต้องมากกว่า 0");
    }

    // console.log("Debug leaveBalance: ", leaveBalance);

    const eligibility = await LeaveRequestService.checkEligibility(
      req.user.id,
      leaveTypeId,
      requestedDays
    );

    console.log("Debug eligibility: ", eligibility);
    if (!eligibility.success) {
      throw createError(400, eligibility.message);
    }

    const leaveBalance = await LeaveBalanceService.getUserBalance(
      req.user.id,
      leaveTypeId
    );

    if (
      requestedDays > leaveBalance.remainingDays ||
      requestedDays > leaveBalance.maxDays
    ) {
      throw createError(400, "วันลาคงเหลือไม่พอ");
    }

    if (!leaveBalance) {
      throw createError(404, `Leave balance not found`);
    }

    //console.log(req.body);
    // console.log("Debug req.user.id: ", req.user.id);

    const leaveRequest = await LeaveRequestService.createRequest(
      req.user.id,
      leaveTypeId,
      startDate,
      endDate,
      reason,
      contact
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
      `คำขอถูกสร้าง: ${reason}${contact ? " ติดต่อ: " + contact : ""}`
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
    // const assignmentApprover1 = await RoleAssignmentService.getAssignments(
    //   "APPROVER_1"
    // );
    // if (assignmentApprover1 && assignmentApprover1.user) {
    //   await sendNotification("SUBMISSION", {
    //     to: assignmentApprover1.user.email,
    //     approverName: `${assignmentApprover1.user.prefixName} ${assignmentApprover1.user.firstName} ${assignmentApprover1.user.lastName}`,
    //     userName: `${req.user.prefixName} ${req.user.firstName} ${req.user.lastName}`,
    //   });
    // }

    const file = req.files;
    if (file && file.length > 0) {
      const imagesPromiseArray = file.map((file) => {
        return cloudUpload(file.path);
      });

      const imgUrlArray = await Promise.all(imagesPromiseArray);

      const attachImages = imgUrlArray.map((imgUrl) => {
        return {
          type: "EVIDENT",
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

// exports.createLeaveRequestController = async (req, res) => {
//   try {
//     const result = await LeaveRequestService.createRequest(req.body);
//     res.status(201).json({
//       message: 'สร้างใบลาเรียบร้อยแล้ว',
//       data: result,
//     });
//   } catch (error) {
//     res.status(error.status || 500).json({ error: error.message });
//   }
// };

//use (not mail)

exports.getMyLeaveRequests = async (req, res) => {
  try {
    const userId = req.user.id;
    const leaveRequests = await LeaveRequestService.getLeaveRequestsByUser(
      userId
    );
    res.json(leaveRequests);
  } catch (error) {
    console.error("Error fetching leave requests:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

exports.getMyApprovedLeaveRequests = async (req, res) => {
  try {
    const userId = req.user.id;
    const leaveRequests = await LeaveRequestService.getApprovedLeaveRequestsByUser(
      userId
    );
    res.json(leaveRequests);
  } catch (error) {
    console.error("Error fetching leave requests:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

exports.updateLeaveStatus = async (req, res, next) => {
  try {
    const requestId = parseInt(req.params.id);
    const { status, remarks, documentNumber } = req.body;
    const approverId = req.user.id;

    if (!status) throw createError(400, "ต้องระบุสถานะ");

    if (!["APPROVED", "REJECTED"].includes(status.trim().toUpperCase())) {
      console.log("Debug status: ", status);
      throw createError(400, "สถานะไม่ถูกต้อง");
    }

    let docNumber = null;
    const user = req.user;
    const userRole = Array.isArray(user.role) ? user.role : [user.role];

    if (userRole.includes("RECEIVER")) {
      docNumber = documentNumber;
    }

    const updatedStatus = await LeaveRequestService.updateRequestStatus(
      requestId,
      status,
      approverId,
      remarks,
      docNumber
    );
    await AuditLogService.createLog(
      req.user.id,
      "Update Status",
      requestId,
      `สถานะเปลี่ยนเป็น: ${status}${remarks ? " เหตุผล: " + remarks : ""}`,
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

    // const leaveRequests = await LeaveRequestService.getRequests(whereCondition);
    const leaveRequests = await LeaveRequestService.getRequestsById(requestId);
    // console.log("Debug leaveRequest: ", leaveRequests);
    if (!leaveRequests) {
      throw createError(404, "Leave request not found");
    }

    if (!user.department || !user.department.id) {
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

exports.getLastLeaveRequestByUserAndType = async (req, res) => {
  const userId = req.params.userId;
  const { leaveTypeId } = req.body;

  if (!leaveTypeId) {
    return res.status(400).json({ message: "leaveTypeId is required in body" });
  }

  try {
    const leaveRequest =
      await LeaveRequestService.getLastLeaveRequestByUserAndType(
        userId,
        leaveTypeId
      );

    res.status(200).json(leaveRequest);
  } catch (err) {
    console.error("❌ Error:", err);
    res.status(500).json({ message: "เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์" });
  }
};

exports.getMyLastApprovedLeaveRequest = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const lastApproved = await LeaveRequestService.getLastApprovedRequestIsMine(
      userId
    );

    if (!lastApproved) {
      throw createError(404, "No approved leave request found");
    }

    res.status(200).json({
      message: "Last approved leave request retrieved",
      data: lastApproved,
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

// ────────────────────────────────
// 🟢   APPROVED AND REJECTED
// ────────────────────────────────

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
      return createError(400, "Leave request can't delete");
    }

    res.status(200).json({ message: "Leave request deleted" });
  } catch (err) {
    next(err);
  }
};

exports.getLeaveRequestsByUserId = async (req, res) => {
  const userId = req.params.userId || req.params.id;

  if (!userId) {
    return res.status(400).json({ message: "ไม่พบ userId ที่ส่งมา" });
  }

  try {
    const leaveRequests = await LeaveRequestService.findByUserId(userId);
    res.status(200).json({ data: leaveRequests });
  } catch (error) {
    console.error("Error getting leave requests by userId:", error);
    res.status(500).json({ message: "ไม่สามารถดึงข้อมูลการลาของผู้ใช้งานได้" });
  }
};

// ────────────────────────────────
// 🟢 GET REQUEST FOR APPROVER
// ────────────────────────────────

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

exports.getAllLeaveRequests = async (req, res, next) => {
  try {
    const leaveRequests = await LeaveRequestService.getAllRequests();
    res.status(200).json({
      message: "ดึงข้อมูลการลาทั้งหมดสำเร็จ",
      data: leaveRequests,
    });
  } catch (err) {
    next(err);
  }
};

exports.getLeaveRequestsForFirstApprover = async (req, res) => {
  try {
    const headId = req.user.id; // ต้องมี auth middleware ตั้งค่า req.user
    const leaveRequests =
      await LeaveRequestService.getPendingRequestsByFirstApprover(headId);
    res.status(200).json(leaveRequests);
  } catch (error) {
    console.error("Error fetching leave requests for head:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

exports.getLeaveRequestsForVerifier = async (req, res) => {
  try {
    const leaveRequests =
      await LeaveRequestService.getPendingRequestsByVerifier();
    res.status(200).json(leaveRequests);
  } catch (error) {
    console.error("Error fetching leave requests at step 2:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

exports.getLeaveRequestsForReceiver = async (req, res) => {
  try {
    const leaveRequests =
      await LeaveRequestService.getPendingRequestsByReceiver();
    res.status(200).json(leaveRequests);
  } catch (error) {
    console.error("Error fetching leave requests at step 2:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

exports.getLeaveRequestsForSecondApprover = async (req, res) => {
  try {
    const leaveRequests =
      await LeaveRequestService.getPendingRequestsBySecondApprover();
    res.status(200).json(leaveRequests);
  } catch (error) {
    console.error("Error fetching leave requests at step 2:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

exports.getLeaveRequestsForThirdApprover = async (req, res) => {
  try {
    const leaveRequests =
      await LeaveRequestService.getPendingRequestsByThirdApprover();
    res.status(200).json(leaveRequests);
  } catch (error) {
    console.error("Error fetching leave requests at step 2:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

exports.getLeaveRequestsForFourthApprover = async (req, res) => {
  try {
    const leaveRequests =
      await LeaveRequestService.getPendingRequestsByFourthApprover();
    res.status(200).json(leaveRequests);
  } catch (error) {
    console.error("Error fetching leave requests at step 2:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

// ────────────────────────────────────────────────────────
// 🟢    APPROVED AND REJECTED (version split)
// ────────────────────────────────────────────────────────

exports.approveByFirstApprover = async (req, res, next) => {
  const id = parseInt(req.params.id);
  const { remarks, comment } = req.body;
  const approverId = req.user.id;

  try {
    if (typeof id !== "number" || isNaN(id)) {
      console.log("Debug id: ", id);
      throw createError(400, "Invalid request ID format");
    }
    const result = await LeaveRequestService.approveByFirstApprover({
      id,
      approverId,
      remarks,
      comment,
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
};

exports.rejectByFirstApprover = async (req, res, next) => {
  const id = parseInt(req.params.id);
  const { remarks, comment } = req.body;
  const approverId = req.user.id;

  try {
    if (typeof id !== "number" || isNaN(id)) {
      console.log("Debug id: ", id);
      throw createError(400, "Invalid request ID format");
    }

    // เรียกใช้ service ในการ reject
    const result = await LeaveRequestService.rejectByFirstApprover({
      id,
      approverId,
      remarks,
      comment,
    });

    return res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

exports.approveByVerifier = async (req, res, next) => {
  const id = parseInt(req.params.id);
  const { remarks, comment } = req.body;
  const approverId = req.user.id;

  try {
    if (typeof id !== "number" || isNaN(id)) {
      console.log("Debug id: ", id);
      throw createError(400, "Invalid request ID format");
    }
    const result = await LeaveRequestService.approveByVerifier({
      id,
      approverId,
      remarks,
      comment,
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
};

exports.rejectByVerifier = async (req, res, next) => {
  const id = parseInt(req.params.id);
  const { remarks, comment } = req.body;
  const approverId = req.user.id;

  try {
    if (typeof id !== "number" || isNaN(id)) {
      console.log("Debug id: ", id);
      throw createError(400, "Invalid request ID format");
    }

    // เรียกใช้ service ในการ reject
    const result = await LeaveRequestService.rejectByVerifier({
      id,
      approverId,
      remarks,
      comment,
    });

    return res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

exports.approveByReceiver = async (req, res, next) => {
  const id = parseInt(req.params.id);
  const { remarks, comment, documentNumber } = req.body;
  const approverId = req.user.id;

  try {
    if (typeof id !== "number" || isNaN(id)) {
      console.log("Debug id: ", id);
      throw createError(400, "Invalid request ID format");
    }
    const result = await LeaveRequestService.approveByReceiver({
      id,
      approverId,
      remarks,
      comment,
      documentNumber,
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
};

exports.rejectByReceiver = async (req, res, next) => {
  const id = parseInt(req.params.id);
  const { remarks, comment } = req.body;
  const approverId = req.user.id;

  try {
    if (typeof id !== "number" || isNaN(id)) {
      console.log("Debug id: ", id);
      throw createError(400, "Invalid request ID format");
    }

    // เรียกใช้ service ในการ reject
    const result = await LeaveRequestService.rejectByReceiver({
      id,
      approverId,
      remarks,
      comment,
    });

    return res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

exports.approveBySecondApprover = async (req, res, next) => {
  const id = parseInt(req.params.id);
  const { remarks, comment } = req.body;
  const approverId = req.user.id;

  try {
    if (typeof id !== "number" || isNaN(id)) {
      console.log("Debug id: ", id);
      throw createError(400, "Invalid request ID format");
    }
    const result = await LeaveRequestService.approveBySecondApprover({
      id,
      approverId,
      remarks,
      comment,
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
};

exports.rejectBySecondApprover = async (req, res, next) => {
  const id = parseInt(req.params.id);
  const { remarks, comment } = req.body;
  const approverId = req.user.id;

  try {
    if (typeof id !== "number" || isNaN(id)) {
      console.log("Debug id: ", id);
      throw createError(400, "Invalid request ID format");
    }

    // เรียกใช้ service ในการ reject
    const result = await LeaveRequestService.rejectBySecondApprover({
      id,
      approverId,
      remarks,
      comment,
    });

    return res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

exports.approveByThirdApprover = async (req, res, next) => {
  const id = parseInt(req.params.id);
  const { remarks, comment } = req.body;
  const approverId = req.user.id;

  try {
    if (typeof id !== "number" || isNaN(id)) {
      console.log("Debug id: ", id);
      throw createError(400, "Invalid request ID format");
    }
    const result = await LeaveRequestService.approveByThirdApprover({
      id,
      approverId,
      remarks,
      comment,
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
};

exports.rejectByThirdApprover = async (req, res, next) => {
  const id = parseInt(req.params.id);
  const { remarks, comment } = req.body;
  const approverId = req.user.id;

  try {
    if (typeof id !== "number" || isNaN(id)) {
      console.log("Debug id: ", id);
      throw createError(400, "Invalid request ID format");
    }

    // เรียกใช้ service ในการ reject
    const result = await LeaveRequestService.rejectByThirdApprover({
      id,
      approverId,
      remarks,
      comment,
    });

    return res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

exports.approveByFourthApprover = async (req, res, next) => {
  const id = parseInt(req.params.id);
  const { remarks, comment } = req.body;
  const approverId = req.user.id;

  try {
    if (typeof id !== "number" || isNaN(id)) {
      console.log("Debug id: ", id);
      throw createError(400, "Invalid request ID format");
    }
    const result = await LeaveRequestService.approveByFourthApprover({
      id,
      approverId,
      remarks,
      comment,
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
};

exports.rejectByFourthApprover = async (req, res, next) => {
  const id = parseInt(req.params.id);
  const { remarks, comment } = req.body;
  const approverId = req.user.id;

  try {
    if (typeof id !== "number" || isNaN(id)) {
      console.log("Debug id: ", id);
      throw createError(400, "Invalid request ID format");
    }

    // เรียกใช้ service ในการ reject
    const result = await LeaveRequestService.rejectByFourthApprover({
      id,
      approverId,
      remarks,
      comment,
    });

    return res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};
