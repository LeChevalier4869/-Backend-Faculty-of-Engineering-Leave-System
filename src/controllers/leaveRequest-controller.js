const LeaveRequestService = require("../services/leaveRequest-service");
const LeaveBalanceService = require("../services/leaveBalance-service");
const AuditLogService = require("../services/auditLog-service");
//const RoleAssignmentService = require("../services/roleAssignment-service");
const createError = require("../utils/createError");
const cloudUpload = require("../utils/cloudUpload");
const UserService = require("../services/user-service");
const { sendEmail, sendNotification } = require("../utils/emailService");
const { calculateWorkingDays } = require("../utils/dateCalculate");
const prisma = require("../config/prisma");

/** create */
exports.createLeaveRequest = async (req, res, next) => {
  try {
    const { leaveTypeId, startDate, endDate, reason, contact } = req.body;

    // ปรับปรุง controller ใหม่ การทำ validation, คำนวณวันลา, ตรวจสอบ leave balance ไปไว้ที่ service
    const leaveRequest = await LeaveRequestService.createRequest(
      req.user.id,
      leaveTypeId,
      startDate,
      endDate,
      reason,
      contact,
    );

    if (!leaveRequest || !leaveRequest.id) throw createError(500, "สร้างคำขอลาไม่สำเร็จ");

    // อัปเดต pending leave balance
    if (typeof leaveRequest.thisTimeDays !== "number" || isNaN(leaveRequest.thisTimeDays)) {
      throw createError(500, "จำนวนวันลาทีผิดพลาด");
    }

    await LeaveBalanceService.updatePendingLeaveBalance(
      req.user.id,
      leaveTypeId,
      leaveRequest.thisTimeDays
    );

    // create log
    await AuditLogService.createLog(
      req.user.id,
      "Create Request",
      leaveRequest.id,
      `คำขอถูกสร้าง: ${reason}${contact ? " ติดต่อ: " + contact : ""}`
    );

    //sent email ตัวเอง สำหรับ การแจ้งเตือน create request
    // const user = await UserService.getUserByIdWithRoles(req.user.id);

    // if (user) {
    //   const userEmail = user.email;
    //   const userName = `${user.prefixName} ${user.firstName} ${user.lastName}`;

    //   const subject = "ยืนยันการยื่นคำขอลา";
    //   const message = `
    //           <h3>สวัสดี ${userName}</h3>
    //           <p>คุณได้ทำการยื่นคำขอลาเรียบร้อยแล้ว</p>
    //           <p>จำนวนวันลา: ${leaveRequest.thisTimeDays}</p>
    //           <br/>
    //           <p>ระบบจัดการวันลาคณะวิศวกรรมศาสตร์</p>
    //       `;
    //   await sendEmail(userEmail, subject, message);
    // }

    // แนบไฟล์
    const file = req.files;
    if (Array.isArray(file) && file.length > 0) {
      const imagesPromiseArray = file.map((file) => cloudUpload(file.path));
      const imgUrlArray = await Promise.all(imagesPromiseArray);
      const attachImages = imgUrlArray.map((imgUrl) => ({
        type: "EVIDENT",
        filePath: imgUrl,
        leaveRequestId: leaveRequest.id,
      }));
      await LeaveRequestService.attachImages(attachImages);
    }

    res.status(201).json({ message: "คำขอลาได้ถูกสร้าง", requestId: leaveRequest.id });
  } catch (err) {
    next(err);
  }
};


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
    const leaveRequests =
      await LeaveRequestService.getApprovedLeaveRequestsByUser(userId);
    res.json(leaveRequests);
  } catch (error) {
    console.error("Error fetching leave requests:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

exports.updateLeaveStatus = async (req, res, next) => {
  try {
    const requestId = parseInt(req.params.id);
    const { status, remarks } = req.body;
    const approverId = req.user.id;

    if (!status) throw createError(400, "ต้องระบุสถานะ");

    if (!["APPROVED", "REJECTED"].includes(status.trim().toUpperCase())) {
      console.log("Debug status: ", status);
      throw createError(400, "สถานะไม่ถูกต้อง");
    }

    const user = req.user;
    const userRole = Array.isArray(user.role) ? user.role : [user.role];

    const updatedStatus = await LeaveRequestService.updateRequestStatus(
      requestId,
      status,
      approverId,
      remarks,
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
    // console.log("Debug requestId11:", requestId);
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

exports.getLastLeaveBefore = async (req, res) => {
  const userId = Number(req.params.userId);
  const { leaveTypeId, beforeDate } = req.body || {};

  if (!Number.isInteger(userId)) {
    return res.status(400).json({ message: "userId (params) is invalid" });
  }

  if (!leaveTypeId) {
    return res.status(400).json({ message: "leaveTypeId is required in body" });
  }

  try {
    const cutoff = beforeDate ? new Date(beforeDate) : new Date();
    const lastLeave =
      await LeaveRequestService.getLastLeaveBefore(
        userId,
        Number(leaveTypeId),
        cutoff,
      );
    //debug
    // console.log("Debugging Leave request", lastLeave);
    res.status(200).json({ data: lastLeave ?? null });
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
    // ต้องมี user token ถึงจะเข้าใช้งานได้
    if (!req.user) {
      return res.status(401).json({ message: "กรุณา login ก่อนใช้งาน" });
    }

    // ตรวจสอบว่า user เป็น approver หรือ proxy approver หรือไม่
    const approvers = await UserService.getApproversForLevel(1, new Date());
    const approverIds = approvers.map(v => v.id);
    
    console.log('User ID:', req.user.id);
    console.log('Approver IDs:', approverIds);
    console.log('Is user approver?', approverIds.includes(req.user.id));
    
    if (!approverIds.includes(req.user.id)) {
      return res.status(403).json({ message: "คุณไม่มีสิทธิ์เข้าถึงข้อมูลนี้ (APPROVER_1 required)" });
    }

    const leaveRequests =
      await LeaveRequestService.getPendingRequestsByFirstApprover();
    res.status(200).json(leaveRequests);
  } catch (error) {
    console.error("Error fetching leave requests for first approver:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

exports.getLeaveRequestsForVerifier = async (req, res) => {
  try {
    // ต้องมี user token ถึงจะเข้าใช้งานได้
    if (!req.user) {
      return res.status(401).json({ message: "กรุณา login ก่อนใช้งาน" });
    }

    // ตรวจสอบว่า user เป็น verifier หรือ proxy verifier หรือไม่
    const verifiers = await UserService.getApproversForLevel(2, new Date());
    const verifierIds = verifiers.map(v => v.id);
    
    console.log('User ID:', req.user.id);
    console.log('Verifier IDs:', verifierIds);
    console.log('Is user verifier?', verifierIds.includes(req.user.id));
    
    if (!verifierIds.includes(req.user.id)) {
      return res.status(403).json({ message: "คุณไม่มีสิทธิ์เข้าถึงข้อมูลนี้ (VERIFIER required)" });
    }

    const leaveRequests =
      await LeaveRequestService.getPendingRequestsByVerifier();
    res.status(200).json(leaveRequests);
  } catch (error) {
    console.error("Error fetching leave requests at step 2:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

exports.getLeaveRequestsForSecondApprover = async (req, res) => {
  try {
    // ต้องมี user token ถึงจะเข้าใช้งานได้
    if (!req.user) {
      return res.status(401).json({ message: "กรุณา login ก่อนใช้งาน" });
    }

    // ตรวจสอบว่า user เป็น approver หรือ proxy approver หรือไม่
    const approvers = await UserService.getApproversForLevel(3, new Date());
    const approverIds = approvers.map(v => v.id);
    
    console.log('User ID:', req.user.id);
    console.log('Approver IDs:', approverIds);
    console.log('Is user approver?', approverIds.includes(req.user.id));
    
    if (!approverIds.includes(req.user.id)) {
      return res.status(403).json({ message: "คุณไม่มีสิทธิ์เข้าถึงข้อมูลนี้ (APPROVER_2 required)" });
    }

    const leaveRequests =
      await LeaveRequestService.getPendingRequestsBySecondApprover();
    res.status(200).json(leaveRequests);
  } catch (error) {
    console.error("Error fetching leave requests at step 4:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

exports.getLeaveRequestsForThirdApprover = async (req, res) => {
  try {
    // ต้องมี user token ถึงจะเข้าใช้งานได้
    if (!req.user) {
      return res.status(401).json({ message: "กรุณา login ก่อนใช้งาน" });
    }

    // ตรวจสอบว่า user เป็น approver หรือ proxy approver หรือไม่
    const approvers = await UserService.getApproversForLevel(4, new Date());
    const approverIds = approvers.map(v => v.id);
    
    console.log('User ID:', req.user.id);
    console.log('Approver IDs:', approverIds);
    console.log('Is user approver?', approverIds.includes(req.user.id));
    
    if (!approverIds.includes(req.user.id)) {
      return res.status(403).json({ message: "คุณไม่มีสิทธิ์เข้าถึงข้อมูลนี้ (APPROVER_3 required)" });
    }

    const leaveRequests =
      await LeaveRequestService.getPendingRequestsByThirdApprover();
    res.status(200).json(leaveRequests);
  } catch (error) {
    console.error("Error fetching leave requests at step 5:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

exports.getLeaveRequestsForFourthApprover = async (req, res) => {
  try {
    // ต้องมี user token ถึงจะเข้าใช้งานได้
    if (!req.user) {
      return res.status(401).json({ message: "กรุณา login ก่อนใช้งาน" });
    }

    // ตรวจสอบว่า user เป็น approver หรือ proxy approver หรือไม่
    const approvers = await UserService.getApproversForLevel(5, new Date());
    const approverIds = approvers.map(v => v.id);
    
    console.log('User ID:', req.user.id);
    console.log('Approver IDs:', approverIds);
    console.log('Is user approver?', approverIds.includes(req.user.id));
    
    if (!approverIds.includes(req.user.id)) {
      return res.status(403).json({ message: "คุณไม่มีสิทธิ์เข้าถึงข้อมูลนี้ (APPROVER_4 required)" });
    }

    const leaveRequests =
      await LeaveRequestService.getPendingRequestsByFourthApprover();
    res.status(200).json(leaveRequests);
  } catch (error) {
    console.error("Error fetching leave requests at step 6:", error);
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

    // ตรวจสอบว่า user เป็น verifier หรือ proxy verifier หรือไม่
    const verifiers = await UserService.getApproversForLevel(2, new Date());
    const verifierIds = verifiers.map(v => v.id);
    
    console.log('Approve - User ID:', req.user.id);
    console.log('Approve - Verifier IDs:', verifierIds);
    console.log('Approve - Is user verifier?', verifierIds.includes(req.user.id));
    
    if (!verifierIds.includes(req.user.id)) {
      return res.status(403).json({ message: "คุณไม่มีสิทธิ์อนุมัติคำขอนี้ (VERIFIER required)" });
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

    // ตรวจสอบว่า user เป็น verifier หรือ proxy verifier หรือไม่
    const verifiers = await UserService.getApproversForLevel(2, new Date());
    const verifierIds = verifiers.map(v => v.id);
    
    console.log('Reject - User ID:', req.user.id);
    console.log('Reject - Verifier IDs:', verifierIds);
    console.log('Reject - Is user verifier?', verifierIds.includes(req.user.id));
    
    if (!verifierIds.includes(req.user.id)) {
      return res.status(403).json({ message: "คุณไม่มีสิทธิ์ปฏิเสธคำขอนี้ (VERIFIER required)" });
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
