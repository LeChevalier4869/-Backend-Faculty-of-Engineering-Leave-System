const AdminService = require("../services/admin-service");
const LeaveRequestService = require("../services/leaveRequest-service");
const LeaveTypeService = require("../services/leaveType-service");
const LeaveBalanceService = require("../services/leaveBalance-service");
const OrgAndDeptService = require("../services/organizationAndDepartment-service");
const createError = require("../utils/createError");
const { sendNotification } = require("../utils/emailService");
const { sendPendingApprovalReminders } = require("../utils/pendingApprovalReminder");
const { calculateWorkingDays } = require("../utils/dateCalculate");
const fs = require("fs");
const UserService = require("../services/user-service");
const AuditLogService = require("../services/auditLog-service");
const cloudUpload = require("../utils/cloudUpload");
const prisma = require("../config/prisma");
const settingService = require("../services/setting-service");
const { resetLeaveBalance } = require("../utils/resetLeaveBalance");

exports.adminList = async (req, res, next) => {
  try {
    const list = await AdminService.getAdminList();
    //console.log("Debug list: ", list);

    if (!list) {
      throw createError(404, `ไม่พบ admin`);
    }

    res.status(200).json({ message: "response ok", adminList: list });
  } catch (err) {
    next(err);
  }
};

exports.getLeaveBalancesForUser = async (req, res, next) => {
  try {
    const userId = parseInt(req.params.userId);
    if (!userId || isNaN(userId)) {
      throw createError(400, "Invalid user id");
    }

    const balances = await AdminService.getLeaveBalancesForUser(userId);
    return res.status(200).json({
      message: "ok",
      data: balances,
    });
  } catch (err) {
    next(err);
  }
};

exports.getApproverPreviewForUser = async (req, res, next) => {
  try {
    const userId = parseInt(req.params.userId);
    if (!userId || isNaN(userId)) {
      throw createError(400, "Invalid user id");
    }

    const steps = await AdminService.getApproverPreviewForUser(userId);

    return res.status(200).json({
      message: "ok",
      data: steps,
    });
  } catch (err) {
    next(err);
  }
};

//-------------------------------------- leave request --------------------
exports.createRequestByAdmin = async (req, res, next) => {
  try {
    const adminId = req.user?.id;
    if (!adminId) throw createError(401, "Unauthorized");

    const {
      userId,
      leaveTypeId,
      startDate,
      endDate,
      reason,
      contact,
      documentNumber,
      documentIssuedDate,
      approvalDetails
    } = req.body;

    let approvalDetailsParsed = approvalDetails;
    if (typeof approvalDetailsParsed === "string" && approvalDetailsParsed.trim()) {
      try {
        approvalDetailsParsed = JSON.parse(approvalDetailsParsed);
      } catch (e) {
        throw createError(400, "รูปแบบ approvalDetails ไม่ถูกต้อง (ต้องเป็น JSON)");
      }
    }

    //validate data
    if (!userId || !leaveTypeId || !startDate || !endDate || documentNumber == null) {
      throw createError(400, "กรุณาระบุ userId, leaveTypeId, startDate, endDate และ documentNumber");
    }

    //get verifier (default)
    const verifier = await UserService.getVerifier();
    const verifierId = verifier?.id ?? null;

    // ← ส่ง object ให้ตรงกับที่ service คาดหวัง
    const leaveRequest = await AdminService.createLeaveRequestForUser(
      Number(userId),
      Number(leaveTypeId),
      startDate,
      endDate,
      reason ?? null,
      Number(verifierId),
      contact ?? null,
      documentNumber,
      documentIssuedDate ?? null,
      adminId,
      approvalDetailsParsed
    );

    await AuditLogService.createLog(
      adminId,
      "CREATE",
      "LeaveRequest",
      leaveRequest.id,
      `Admin สร้างคำขอลาแทนผู้ใช้ userId=${userId}`,
      req.ip,
      req.get('User-Agent')
    );

    // แนบไฟล์
    const file = req.files;
    if (Array.isArray(file) && file.length > 0) {
      const imagesPromiseArray = file.map((file) => cloudUpload(file.path));
      const imgUrlArray = await Promise.all(imagesPromiseArray);
      const attachImages = imgUrlArray.map((imgUrl, index) => ({
        type: "PAPER",
        filePath: imgUrl,
        leaveRequestId: leaveRequest.id,
        name: file[index]?.originalname || `paper_${Date.now()}_${index}`,
      }));
      await LeaveRequestService.attachImages(attachImages);
    }

    return res.status(201).json({
      message: "สร้างคำขอลาเรียบร้อย",
      data: leaveRequest
    });
  } catch (err) {
    next(err);
  }
};

//--------------------- Holiday --------------------
exports.getHoliday = async (req, res, next) => {
  try {
    const holiday = await AdminService.getHoliday();

    res.status(200).json({ message: "Get holidays success", data: holiday });
  } catch (err) {
    next(err);
  }
};

exports.addHoliday = async (req, res, next) => {
  try {
    const { date, description, isRecurring, holidayType } = req.body;

    if (
      date === undefined ||
      description === undefined ||
      isRecurring === undefined ||
      holidayType === undefined
    ) {
      throw createError(400, "Required field");
    }

    const parsedDate = new Date(date);
    if (isNaN(parsedDate.getTime())) {
      throw createError(400, "Invalid date format");
    }

    const fiscalYear = parsedDate.getFullYear();

    const holiday = await AdminService.createHoliday({
      date: parsedDate,
      description,
      fiscalYear,
      isRecurring,
      holidayType,
    });

    // บันทึก Audit Log การสร้างวันหยุด
    await AuditLogService.createLog(
      req.user.id,
      "CREATE",
      "Holiday",
      holiday.id,
      `สร้างวันหยุด: ${description} (${date})`,
      req.ip,
      req.get('User-Agent')
      // ไม่ส่ง entityData - จะดึงอัตโนมัติ
    );

    res.status(201).json({ message: "Added holiday completed", data: holiday });
  } catch (err) {
    next(err);
  }
};

exports.updateHoliday = async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);

    if (isNaN(id)) {
      throw createError(400, "Invalid holiday ID");
    }

    const oldHoliday = await prisma.holiday.findUnique({ where: { id } });
    if (!oldHoliday) throw createError(404, "ไม่พบวันหยุดที่จะอัปเดต");

    const { date, description, isRecurring, holidayType } = req.body;
    const updateData = {};

    if (date) {
      const parsedDate = new Date(date);
      if (isNaN(parsedDate.getTime())) {
        throw createError(400, "Invalid date format");
      }
      updateData.date = parsedDate;

      updateData.fiscalYear = parsedDate.getFullYear();
    }

    if (description !== undefined) updateData.description = description;
    if (isRecurring !== undefined) updateData.isRecurring = isRecurring;
    if (holidayType !== undefined) updateData.holidayType = holidayType;

    const updatedHoliday = await AdminService.updateHolidayById(id, updateData);

    // บันทึก Audit Log การอัปเดตวันหยุด (พร้อม diff)
    await AuditLogService.createUpdateLog(
      req.user.id,
      "Holiday",
      id,
      oldHoliday,
      updatedHoliday,
      req.ip,
      req.get('User-Agent')
    );

    res.status(200).json({
      message: "อัปเดตวันหยุดสำเร็จ",
      data: updatedHoliday,
    });
  } catch (err) {
    next(err);
  }
};

exports.deleteHoliday = async (req, res, next) => {
  try {
    const id = parseInt(req.params.id); // แปลง id เป็น number

    if (isNaN(id)) {
      throw createError(400, "Invalid holiday ID");
    }

    await AdminService.deleteHoliday(id); // เรียก service

    // บันทึก Audit Log การลบวันหยุด
    await AuditLogService.createLog(
      req.user.id,
      "DELETE",
      "Holiday",
      id,
      `ลบวันหยุด (ID: ${id})`,
      req.ip,
      req.get('User-Agent')
      // ไม่ส่ง entityData - จะดึงอัตโนมัติ
    );

    res.status(200).json({ message: "ลบวันหยุดสำเร็จ" });
  } catch (err) {
    next(err);
  }
};

// --------------------
//        role
// --------------------

exports.roleList = async (req, res, next) => {
  try {
    const roleList = await AdminService.roleList();

    if (!roleList) {
      console.log("Debug roleList: ", roleList);
      return createError(404, "role not found");
    }

    res.status(200).json({ message: "respones ok", roleList });
  } catch (err) {
    next(err);
  }
};

exports.createRole = async (req, res, next) => {
  try {
    const { name, description } = req.body;

    if (!name) throw createError(400, "กรุณาใส่ชื่อ");

    const role = await AdminService.createRole(name, description);

    // บันทึก Audit Log การสร้าง Role
    await AuditLogService.createLog(
      req.user.id,
      "CREATE",
      "Role",
      role.id,
      `สร้าง Role: ${name}${description ? ` (คำอธิบาย: ${description})` : ''}`,
      req.ip,
      req.get('User-Agent')
    );

    res.status(201).json({ message: "เพิ่ม role เรียบร้อย", data: role });
  } catch (err) {
    next(err);
  }
};
// Role ที่ระบบใช้งาน — ห้ามเปลี่ยนชื่อหรือลบ
const SYSTEM_ROLES = [
  "USER", "ADMIN", "SUPER_ADMIN",
  "VERIFIER", "APPROVER_1", "APPROVER_2", "APPROVER_3", "APPROVER_4"
];

exports.updateRole = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, description } = req.body;

    if (!id || !name) throw createError(400, "ไม่สามารถอัพเดตได้");
    if (isNaN(id)) throw createError(400, "ไอดีต้องเป็นตัวเลขเท่านั้น");

    const oldRole = await AdminService.getRoleById(parseInt(id));

    // ป้องกัน system role: ห้ามเปลี่ยนชื่อ (แก้ description ได้)
    if (SYSTEM_ROLES.includes(oldRole.name) && name !== oldRole.name) {
      throw createError(400, `ไม่สามารถเปลี่ยนชื่อ Role "${oldRole.name}" ได้ เนื่องจากเป็น System Role ที่ระบบใช้งานอยู่`);
    }

    const role = await AdminService.updateRole(parseInt(id), name, description);

    // บันทึก Audit Log การอัพเดต Role (พร้อม diff)
    await AuditLogService.createUpdateLog(
      req.user.id,
      "Role",
      parseInt(id),
      oldRole,
      role,
      req.ip,
      req.get('User-Agent')
    );

    res.status(200).json({ message: "อัพเดตเรียบร้อย", data: role });
  } catch (err) {
    next(err);
  }
};

exports.deleteRole = async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!id) throw createError(400, "ไม่พบไอดี");
    if (isNaN(id)) throw createError(400, "ไอดีต้องเป็นตัวเลขเท่านั้น");

    // ป้องกัน system role: ห้ามลบ
    const existingRole = await AdminService.getRoleById(parseInt(id));
    if (existingRole && SYSTEM_ROLES.includes(existingRole.name)) {
      throw createError(400, `ไม่สามารถลบ Role "${existingRole.name}" ได้ เนื่องจากเป็น System Role ที่ระบบใช้งานอยู่`);
    }

    const role = await AdminService.deleteRole(parseInt(id));

    // บันทึก Audit Log การลบ Role
    await AuditLogService.createLog(
      req.user.id,
      "DELETE",
      "Role",
      parseInt(id),
      `ลบ Role: ${role.name} (ID: ${id})`,
      req.ip,
      req.get('User-Agent')
    );

    res.status(200).json({ message: "ลบเรียบร้อยแล้ว" });
  } catch (err) {
    next(err);
  }
};

exports.getRoleById = async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!id) throw createError(400, "ไม่พบไอดี");
    if (isNaN(id)) throw createError(400, "ไอดีต้องเป็นตัวเลขเท่านั้น");

    const role = await AdminService.getRoleById(parseInt(id));
    res
      .status(200)
      .json({ message: "ดึงข้อมูล role เรียบร้อยแล้ว", data: role });
  } catch (err) {
    next(err);
  }
};

// --------------------
//      departments
// --------------------

exports.assignHeadDepartment = async (req, res, next) => {
  try {
    const departmentId = parseInt(req.body.departmentId, 10);
    const headId = parseInt(req.body.headId, 10);

    if (!Number.isInteger(departmentId) || !Number.isInteger(headId)) {
      throw createError(400, "departmentId และ headId ต้องเป็นตัวเลข");
    }

    // AdminService.assignHead จัดการทั้งการตั้งหัวหน้าและ sync บทบาท APPROVER_1
    // (ถอดจากคนเดิม + ให้คนใหม่) ภายใน transaction เดียว
    const updatedDepartment = await AdminService.assignHead(departmentId, headId);

    res
      .status(200)
      .json({ message: "มอบหมายหัวหน้าแผนกสำเร็จ", data: updatedDepartment });
  } catch (err) {
    next(err);
  }
};

// --------------------
//     personnelType
// --------------------

exports.getAllPersonnelType = async (req, res, next) => {
  try {
    const personnelType = await OrgAndDeptService.getAllPersonnelTypes();
    if (!personnelType || personnelType.length === 0)
      throw createError(404, "ไม่พบข้อมูลประเภทบุคคลากร");
    res.status(200).json({
      message: "ดึงข้อมูลประเภทบุคคลากรทั้งหมดเรียบร้อยแล้ว",
      data: personnelType,
    });
  } catch (err) {
    next(err);
  }
};

exports.getPersonnelTypeById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const personnelType = await OrgAndDeptService.getPersonnelTypeById(
      parseInt(id)
    );
    if (!personnelType) throw createError(404, "ไม่พบประเภทบุคคลากร");
    res.status(200).json({
      message: "ดึงข้อมูลประเภทบุคคลากรเรียบร้อยแล้ว",
      data: personnelType,
    });
  } catch (err) {
    next(err);
  }
};

exports.createPersonnelType = async (req, res, next) => {
  try {
    const { name } = req.body;
    const personnelType = await OrgAndDeptService.createPersonnelType(name);
    if (!personnelType) throw createError(400, "สร้างประเภทบุคคลากรไม่สำเร็จ");

    // บันทึก Audit Log การสร้างประเภทบุคคลากร
    await AuditLogService.createLog(
      req.user.id,
      "CREATE",
      "PersonnelType",
      personnelType.id,
      `สร้างประเภทบุคคลากร: ${name}`,
      req.ip,
      req.get('User-Agent')
    );

    // ตรวจสอบว่ามี Rank config หรือยัง
    const rankCount = await OrgAndDeptService.countRanksByPersonnelTypeId(personnelType.id);

    res.status(201).json({
      message: "สร้างประเภทบุคคลากรเรียบร้อยแล้ว",
      data: personnelType,
      warning: rankCount === 0
        ? "ประเภทบุคลากรนี้ยังไม่มีการกำหนดเงื่อนไขวันลา (Rank) กรุณาตั้งค่าเงื่อนไขวันลาสำหรับแต่ละประเภทการลา เพื่อให้ระบบทำงานได้ถูกต้อง"
        : null,
    });
  } catch (err) {
    next(err);
  }
};

exports.updatePersonnelType = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name } = req.body;
    if (!id) throw createError(404, "ไม่พบข้อมูล id");
    if (!name) throw createError(400, "กรุณาระบุ name");

    // ดึงข้อมูลเดิมก่อนอัปเดตเพื่อบันทึกใน audit log
    const oldPersonnelType = await OrgAndDeptService.getPersonnelTypeById(parseInt(id));
    const oldName = oldPersonnelType?.name;

    const personnelType = await OrgAndDeptService.updatePersonnelType(
      parseInt(id),
      name
    );
    if (!personnelType) throw createError(400, "อัปเดตประเภทบุคคลากรไม่สำเร็จ");

    // บันทึก Audit Log การอัปเดตประเภทบุคคลากร (พร้อม diff)
    await AuditLogService.createUpdateLog(
      req.user.id,
      "PersonnelType",
      parseInt(id),
      oldPersonnelType,
      personnelType,
      req.ip,
      req.get('User-Agent')
    );

    res.status(200).json({
      message: "อัปเดตประเภทบุคคลากรเรียบร้อยแล้ว",
      data: personnelType,
    });
  } catch (err) {
    next(err);
  }
};

exports.deletePersonnelType = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!id) throw createError(404, "ไม่พบข้อมูล id");
    const numID = parseInt(id);

    const personnelTypeToDelete = await OrgAndDeptService.getPersonnelTypeById(numID);
    if (!personnelTypeToDelete) throw createError(404, "ไม่พบประเภทบุคคลากรที่ต้องการลบ");
    const typeName = personnelTypeToDelete.name;

    // ตรวจสอบ relations ก่อนลบ
    const { userCount, rankCount } = await OrgAndDeptService.countPersonnelTypeRelations(numID);

    if (userCount > 0) {
      throw createError(400,
        `ไม่สามารถลบประเภทบุคลากร "${typeName}" ได้ เนื่องจากมีผู้ใช้งาน ${userCount} คนที่อ้างอิงอยู่ ` +
        `กรุณาย้ายผู้ใช้งานไปประเภทอื่นก่อนลบ`
      );
    }

    if (rankCount > 0) {
      throw createError(400,
        `ไม่สามารถลบประเภทบุคลากร "${typeName}" ได้ เนื่องจากมีเงื่อนไขวันลา (Rank) ${rankCount} รายการที่อ้างอิงอยู่ ` +
        `กรุณาลบเงื่อนไขวันลาที่เกี่ยวข้องก่อนลบ`
      );
    }

    await OrgAndDeptService.deletePersonnelType(numID);

    // บันทึก Audit Log การลบประเภทบุคคลากร
    await AuditLogService.createLog(
      req.user.id,
      "DELETE",
      "PersonnelType",
      numID,
      `ลบประเภทบุคคลากร: ${typeName}`,
      req.ip,
      req.get('User-Agent')
    );

    res.status(200).json({ message: "ลบประเภทบุคคลากรเรียบร้อยแล้ว" });
  } catch (err) {
    next(err);
  }
};

// -------------------- departments --------------------
exports.departmentList = async (req, res, next) => {
  try {
    const list = await AdminService.departmentList();
    if (!list) throw createError(404, "ไม่พบข้อมูลแผนก");
    res.status(200).json({ message: "ดึงข้อมูลแผนกเรียบร้อยแล้ว", data: list });
  } catch (err) {
    next(err);
  }
};
// -------------------- departments --------------------

// GET /admin/departments
exports.departmentList = async (req, res, next) => {
  try {
    const list = await AdminService.departmentList();
    if (!list) throw createError(404, "ไม่พบข้อมูลแผนก");
    res.status(200).json({ message: "ดึงข้อมูลแผนกเรียบร้อยแล้ว", data: list });
  } catch (err) {
    next(err);
  }
};

// POST /admin/departments
exports.departmentCreate = async (req, res, next) => {
  try {
    const { name, organizationId, headId, appointDate } = req.body;
    if (!name || !organizationId) {
      throw createError(400, "ต้องระบุชื่อแผนกและ organizationId");
    }

    // optional: เช็ก organization มีจริง
    const org = await AdminService.getOrganizationById(+organizationId);
    if (!org) throw createError(404, "ไม่พบหน่วยงาน");

    // Validate: one head per department
    if (headId) {
      const existingDeptWithHead = await prisma.department.findFirst({
        where: { headId: +headId }
      });
      
      if (existingDeptWithHead) {
        throw createError(400, `ผู้ใช้นี้เป็นหัวหน้าแผนก "${existingDeptWithHead.name}" อยู่แล้ว แผนกละหัวหน้าได้เพียงคนเดียว`);
      }
    }

    const data = {
      name,
      organizationId: +organizationId,
      headId: headId != null ? +headId : null,
      appointDate: appointDate ? new Date(appointDate) : null,
    };

    const newDept = await AdminService.createDepartment(data);

    // บันทึก Audit Log การสร้างแผนก
    await AuditLogService.createLog(
      req.user.id,
      "CREATE",
      "Department",
      newDept.id,
      `สร้างแผนก: ${name}`,
      req.ip,
      req.get('User-Agent')
    );

    res.status(201).json({ message: "สร้างแผนกเรียบร้อย", data: newDept });
  } catch (err) {
    next(err);
  }
};

// PUT /admin/departments/:id
exports.departmentUpdate = async (req, res, next) => {
  try {
    const id = +req.params.id;
    if (isNaN(id)) throw createError(400, "Invalid department ID");

    const oldDept = await prisma.department.findUnique({ where: { id } });
    if (!oldDept) throw createError(404, "ไม่พบแผนกที่จะอัปเดต");

    const { name, organizationId, headId, appointDate } = req.body;
    if (!name && !organizationId && headId == null && !appointDate) {
      throw createError(400, "ไม่มีข้อมูลจะอัปเดต");
    }

    const updateData = {};
    if (name) updateData.name = name;
    if (organizationId) updateData.organizationId = +organizationId;
    if (headId !== undefined) updateData.headId = headId ? +headId : null;
    if (appointDate) updateData.appointDate = new Date(appointDate);

    // Validate: one head per department
    if (headId) {
      const existingDeptWithHead = await prisma.department.findFirst({
        where: {
          headId: +headId,
          id: { not: id }
        }
      });
      
      if (existingDeptWithHead) {
        throw createError(400, `ผู้ใช้นี้เป็นหัวหน้าแผนก "${existingDeptWithHead.name}" อยู่แล้ว แผนกละหัวหน้าได้เพียงคนเดียว`);
      }
    }

    const updated = await AdminService.updateDepartment({ id, ...updateData });
    if (!updated) throw createError(404, "ไม่พบแผนกที่จะอัปเดต");

    // บันทึก Audit Log การอัปเดตแผนก (พร้อม diff)
    await AuditLogService.createUpdateLog(
      req.user.id,
      "Department",
      id,
      oldDept,
      updated,
      req.ip,
      req.get('User-Agent')
    );

    res.status(200).json({ message: "อัปเดตแผนกเรียบร้อย", data: updated });
  } catch (err) {
    next(err);
  }
};

// DELETE /admin/departments/:id
exports.departmentDelete = async (req, res, next) => {
  try {
    const id = +req.params.id;
    if (isNaN(id)) throw createError(400, "Invalid department ID");

    // ตรวจสอบ relations ก่อนลบ
    const userCount = await OrgAndDeptService.countUsersByDepartmentId(id);
    if (userCount > 0) {
      const dept = await OrgAndDeptService.getDepartmentById(id);
      throw createError(400,
        `ไม่สามารถลบแผนก "${dept?.name || id}" ได้ เนื่องจากมีผู้ใช้งาน ${userCount} คนที่สังกัดอยู่ ` +
        `กรุณาย้ายผู้ใช้งานไปแผนกอื่นก่อนลบ`
      );
    }

    await AdminService.deleteDepartment(id);

    // บันทึก Audit Log การลบแผนก
    await AuditLogService.createLog(
      req.user.id,
      "DELETE",
      "Department",
      id,
      `ลบแผนก (ID: ${id})`,
      req.ip,
      req.get('User-Agent')
    );

    res.status(200).json({ message: "ลบแผนกเรียบร้อยแล้ว" });
  } catch (err) {
    next(err);
  }
};

// -------------------- employmentTypes --------------------
const EMPLOYMENT_TYPES = ["ACADEMIC", "SUPPORT"];

exports.employmentTypeList = async (_req, res) => {
  res
    .status(200)
    .json({ message: "ดึงข้อมูลประเภทพนักงานแล้ว", data: EMPLOYMENT_TYPES });
};

// -------------------- organizations --------------------
exports.organizationList = async (req, res, next) => {
  try {
    const list = await AdminService.organizationList();
    if (!list || list.length === 0) {
      throw createError(404, "ไม่พบข้อมูลหน่วยงาน");
    }
    res.status(200).json({
      message: "ดึงข้อมูลหน่วยงานเรียบร้อยแล้ว",
      data: list,
    });
  } catch (err) {
    next(err);
  }
};

// --------------------
//     manageUser
// --------------------
exports.getAllUsers = async (req, res) => {
  try {
    const { organizationId, search } = req.query;
    const where = {};

    if (organizationId) {
      where.department = { organizationId: Number(organizationId) };
    }

    // เพิ่มการค้นหา
    if (search) {
      where.OR = [
        { firstName: { contains: search } },
        { lastName: { contains: search } },
        { email: { contains: search } },
        { prefixName: { contains: search } },
        {
          positionNumbers: {
            some: {
              positionNumber: { contains: search }
            }
          }
        }
      ];
    }

    const users = await prisma.user.findMany({
      where,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        prefixName: true,
        department: {
          select: {
            name: true,
          },
        },
        positionNumbers: {
          orderBy: { effectiveFrom: 'desc' },
          take: 1, // เอาแค่ล่าสุด
          select: {
            positionNumber: true,
            effectiveFrom: true,
          },
        },
      },
      orderBy: { firstName: 'asc' },
    });

    // สร้าง fullName ในโค้ดฝั่ง server
    const data = users.map(u => ({
      id: u.id,
      fullName: `${u.prefixName || ''}${u.prefixName ? ' ' : ''}${u.firstName} ${u.lastName}`,
      email: u.email,
      prefixName: u.prefixName,
      firstName: u.firstName,
      lastName: u.lastName,
      department: u.department,
      positionNumbers: u.positionNumbers,
    }));

    return res.status(200).json({
      message: 'ดึงข้อมูลผู้ใช้สำเร็จ',
      data,
    });
  } catch (error) {
    console.error('[getAllUsers]', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

exports.getUserById = async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: Number(req.params.id) },
    });
    if (!user) return res.status(404).json({ message: "User not found" });
    res.json({ data: user });
  } catch (err) {
    next(err);
  }
};

exports.createUserByAdmin = async (req, res, next) => {
  try {
    const {
      prefixName,
      firstName,
      lastName,
      sex,
      email,
      phone,
      position,
      positionNumber,
      hireDate,
      employmentType,
      personnelTypeId,
      departmentId,
    } = req.body;

    // ✅ Validation
    if (!email || !firstName || !lastName) {
      throw createError(400, "กรุณากรอกข้อมูลที่จำเป็นให้ครบถ้วน");
    }

    // ✅ เลขที่ตำแหน่งบังคับกรอก
    if (!positionNumber || String(positionNumber).trim() === "") {
      throw createError(400, "กรุณาระบุเลขที่ตำแหน่ง");
    }

    // ✅ แปลงค่าเพศให้เป็นภาษาไทยให้ตรงทั้งระบบ (ชาย/หญิง)
    const normalizedSex =
      sex === "MALE" || sex === "ชาย"
        ? "ชาย"
        : sex === "FEMALE" || sex === "หญิง"
          ? "หญิง"
          : sex;

    if (!email.endsWith("@rmuti.ac.th")) {
      throw createError(400, "อีเมลต้องอยู่ในโดเมน rmuti.ac.th เท่านั้น");
    }

    const exists = await UserService.getUserByEmail(email);
    if (exists) {
      throw createError(400, "อีเมลนี้มีผู้ใช้งานในระบบแล้ว");
    }

    if (!["ACADEMIC", "SUPPORT"].includes(employmentType)) {
      throw createError(400, "ประเภทพนักงานไม่ถูกต้อง");
    }

    const parsedHireDate = hireDate ? new Date(hireDate) : null;

    const user = await UserService.createUser({
      prefixName,
      firstName,
      lastName,
      sex: normalizedSex,
      email,
      phone,
      position,
      hireDate: parsedHireDate,
      employmentType,
      personnelTypeId: parseInt(personnelTypeId),
      departmentId: parseInt(departmentId),
    });

    // ✅ Profile Picture (Optional)
    if (req.file) {
      const imgUrl = await cloudUpload(req.file.path);
      await UserService.createUserProfile(user.id, imgUrl);
      fs.unlink(req.file.path, () => { });
    }

    // ✅ Default Role = USER
    const roles = await UserService.getRolesByNames(["USER"]);
    await UserService.assignRolesToUser(
      user.id,
      roles.map((role) => role.id)
    );

    // ✅ กำหนด Rank ตาม personnelType (ดึง hireDate/personnelTypeId ของ user ที่เพิ่งสร้าง)
    await UserService.assignRankToUser(
      user.id,
      parseInt(personnelTypeId),
      parsedHireDate
    );

    // ✅ gen leave balance ตาม rank ที่ได้ (กรองสิทธิ์ลาเฉพาะเพศตาม normalizedSex)
    await UserService.assignLeaveBalanceFromRanks(user.id, normalizedSex);

    // ✅ กำหนดเลขที่ตำแหน่ง (รองรับย้ายเลขจากคนเดิม) ภายใน transaction
    await prisma.$transaction(async (tx) =>
      UserService.assignPositionNumberToUser(
        tx,
        user.id,
        positionNumber,
        req.user?.id || null
      )
    );

    // บันทึก Audit Log การสร้างผู้ใช้
    await AuditLogService.createLog(
      req.user.id,
      "CREATE",
      "User",
      user.id,
      `สร้างผู้ใช้: ${prefixName} ${firstName} ${lastName} (${email})`,
      req.ip,
      req.get('User-Agent')
      // ไม่ส่ง entityData - จะดึงอัตโนมัติ
    );

    // ✅ ส่งอีเมลต้อนรับ (ไม่ให้ email พังกระทบการสร้างผู้ใช้)
    if (email) {
      try {
        await sendNotification("WELCOME", {
          to: email,
          userName: `${prefixName || ""} ${firstName} ${lastName}`.trim(),
          email,
          position,
        });
      } catch (emailError) {
        console.error("Failed to send welcome email:", emailError.message);
      }
    }

    return res
      .status(201)
      .json({ message: "สร้างผู้ใช้สำเร็จ", data: user });
  } catch (err) {
    next(err);
  }
};

// ส่งอีเมลเตือนผู้อนุมัติที่มีคำขอลาค้างพิจารณา (เรียกแบบ manual ได้ นอกเหนือจาก cron)
// POST /admin/send-pending-reminders  body: { thresholdDays?: number }
exports.sendPendingReminders = async (req, res, next) => {
  try {
    const thresholdDays = parseInt(req.body?.thresholdDays, 10);
    const result = await sendPendingApprovalReminders(
      Number.isNaN(thresholdDays) ? 3 : thresholdDays
    );
    return res.status(200).json({ message: "ส่งอีเมลเตือนเรียบร้อย", ...result });
  } catch (err) {
    next(err);
  }
};

// -------------------- Position Number Management --------------------
exports.updateUserPositionNumber = async (req, res, next) => {
  try {
    const { userId } = req.params;
    const { positionNumber } = req.body;
    const changedByUserId = req.user?.id;

    if (!userId || !positionNumber) {
      throw createError(400, "ต้องระบุ userId และ positionNumber");
    }

    if (isNaN(userId)) {
      throw createError(400, "userId ต้องเป็นตัวเลข");
    }

    // ตรวจสอบว่า user มีอยู่จริง
    const user = await UserService.getUserByIdWithRoles(parseInt(userId));
    if (!user) {
      throw createError(404, "ไม่พบผู้ใช้");
    }

    const result = await UserService.updateUserPositionNumber(
      parseInt(userId),
      positionNumber,
      changedByUserId
    );

    res.status(200).json({
      message: "อัปเดตเลขที่ตำแหน่งสำเร็จ",
      data: result,
    });
  } catch (err) {
    next(err);
  }
};

exports.getUserPositionNumberHistory = async (req, res, next) => {
  try {
    const { userId } = req.params;

    if (!userId) {
      throw createError(400, "ต้องระบุ userId");
    }

    if (isNaN(userId)) {
      throw createError(400, "userId ต้องเป็นตัวเลข");
    }

    const history = await UserService.getUserPositionNumberHistory(parseInt(userId));

    res.status(200).json({
      message: "ดึงประวัติเลขที่ตำแหน่งสำเร็จ",
      data: history,
    });
  } catch (err) {
    next(err);
  }
};

exports.getCurrentPositionNumber = async (req, res, next) => {
  try {
    const { userId } = req.params;

    if (!userId) {
      throw createError(400, "ต้องระบุ userId");
    }

    if (isNaN(userId)) {
      throw createError(400, "userId ต้องเป็นตัวเลข");
    }

    const current = await UserService.getCurrentPositionNumber(parseInt(userId));

    if (!current) {
      return res.status(404).json({
        message: "ไม่พบเลขที่ตำแหน่งปัจจุบันสำหรับผู้ใช้นี้",
      });
    }

    res.status(200).json({
      message: "ดึงเลขที่ตำแหน่งปัจจุบันสำเร็จ",
      data: current,
    });
  } catch (err) {
    next(err);
  }
};

exports.getPositionNumberByNumber = async (req, res, next) => {
  try {
    const { positionNumber } = req.params;

    if (!positionNumber) {
      throw createError(400, "ต้องระบุ positionNumber");
    }

    const result = await UserService.getPositionNumberByNumber(positionNumber);

    if (!result) {
      return res.status(404).json({
        message: "ไม่พบผู้ใช้ที่ถือเลขที่ตำแหน่งนี้ในปัจจุบัน",
      });
    }

    res.status(200).json({
      message: "ดึงข้อมูลผู้ใช้สำเร็จ",
      data: result,
    });
  } catch (err) {
    next(err);
  }
};

exports.updateUserById = async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) throw createError(400, "ID ต้องเป็นตัวเลข");

    const oldUser = await prisma.user.findUnique({
      where: { id },
      include: { userRoles: { include: { role: true } } },
    });
    if (!oldUser) throw createError(404, "ไม่พบผู้ใช้งาน");

    const targetRoles = (oldUser.userRoles || []).map((ur) => ur.role?.name).filter(Boolean);
    const requesterIsSuperAdmin = (req.user.roles || []).includes("SUPER_ADMIN");

    if (targetRoles.includes("SUPER_ADMIN") && !requesterIsSuperAdmin) {
      throw createError(403, "ไม่สามารถแก้ไขข้อมูลผู้ใช้ที่มีสิทธิ์ SUPER_ADMIN ได้ ต้องใช้สิทธิ์ SUPER_ADMIN เท่านั้น");
    }

    const {
      prefixName,
      firstName,
      lastName,
      email,
      phone,
      sex,
      position,
      hireDate,
      employmentType,
      personnelTypeId,
      departmentId,
    } = req.body;

    const updateData = {
      prefixName,
      firstName,
      lastName,
      email,
      phone,
      sex,
      position,
      hireDate: hireDate ? new Date(hireDate) : null,
      employmentType,
      personnelTypeId: parseInt(personnelTypeId),
      departmentId: parseInt(departmentId),
    };

    const updatedUser = await AdminService.updateUserById(id, updateData);

    await AuditLogService.createUpdateLog(
      req.user.id,
      "User",
      id,
      oldUser,
      updatedUser,
      req.ip,
      req.get('User-Agent')
    );

    res
      .status(200)
      .json({ message: "อัปเดตผู้ใช้งานเรียบร้อย", data: updatedUser });
  } catch (err) {
    next(err);
  }
};

exports.deleteUser = async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) throw createError(400, "Invalid user ID");

    // Get user info before deletion for audit log
    const userToDelete = await prisma.user.findUnique({
      where: { id },
      select: { id: true, firstName: true, lastName: true, email: true }
    });

    await AdminService.deleteUserById(id);

    await AuditLogService.createLog(
      req.user.id,
      "DELETE",
      "User",
      id,
      `ลบผู้ใช้: ${userToDelete?.firstName} ${userToDelete?.lastName} (${userToDelete?.email})`,
      req.ip,
      req.get('User-Agent'),
      userToDelete
    );

    res.status(200).json({ message: "ลบผู้ใช้เรียบร้อยแล้ว" });
  } catch (err) {
    next(err);
  }
};

//---------------------settings--------------------
exports.createSetting = async (req, res) => {
  try {
    if (!req.body.key || !req.body.type || !req.body.value) {
      const error = new Error("กรุณากรอกข้อมูลให้ครบถ้วน");
      error.status = 400;
      throw error;
    }

    const setting = await settingService.createSetting(req.body);
    res.json(setting);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getAllSetting = async (req, res) => {
  try {
    const settings = await settingService.getAllSettings();
    res.json(settings);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getSettingById = async (req, res) => {
  try {
    const setting = await settingService.getSettingById(req.params.id);
    if (!setting) return res.status(404).json({ error: "Setting not found" });
    res.json(setting);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.updateSetting = async (req, res) => {
  try {
    const setting = await settingService.updateSetting(req.params.id, req.body);
    res.json(setting);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.deleteSetting = async (req, res) => {
  try {
    await settingService.deleteSetting(req.params.id);
    res.json({ message: "ลบค่าในระบบเสร็จสิ้น" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

//--------------------- Leave Balance Reset --------------------
exports.resetLeaveBalance = async (req, res, next) => {
  try {
    const { confirm, force } = req.body || {};

    // ชั้นที่ 1: ต้องยืนยันก่อนเสมอ (กันการเรียก API โดยไม่ตั้งใจ)
    if (confirm !== true) {
      throw createError(400, "ต้องส่ง confirm: true เพื่อยืนยันการรีเซ็ตยอดวันลา");
    }

    // อ่านปีงบประมาณปัจจุบันที่จะถูกรีเซ็ต
    const fySetting = await prisma.setting.findUnique({ where: { key: "fiscalYear" } });
    const year = fySetting ? parseInt(fySetting.value, 10) : new Date().getFullYear();

    // ชั้นที่ 2: ถ้าปีงบนี้มีการใช้วันลาไปแล้ว (used/pending > 0) การรีเซ็ตจะลบข้อมูลทิ้ง
    //           → ต้องส่ง force: true เพื่อยืนยันซ้ำ (กันลบข้อมูลกลางปีโดยไม่ตั้งใจ)
    const activeBalance = await prisma.leaveBalance.findFirst({
      where: { year, OR: [{ usedDays: { gt: 0 } }, { pendingDays: { gt: 0 } }] },
      select: { id: true },
    });

    if (activeBalance && force !== true) {
      const agg = await prisma.leaveBalance.aggregate({
        where: { year },
        _sum: { usedDays: true, pendingDays: true },
      });
      throw createError(
        409,
        `ปีงบประมาณ ${year} มีการใช้วันลาไปแล้ว (ใช้ไป ${agg._sum.usedDays || 0} วัน, รออนุมัติ ${agg._sum.pendingDays || 0} วัน) — ` +
          `การรีเซ็ตจะลบยอดเหล่านี้ทิ้งทั้งหมด หากยืนยันให้ส่ง force: true`
      );
    }

    console.log(`🔄 Admin รีเซ็ต Leave Balance ด้วยตนเอง (ปีงบ ${year}, force=${!!force})`);

    await resetLeaveBalance();

    // บันทึก audit log สำหรับการกระทำที่อันตราย
    try {
      await AuditLogService.createLog(
        req.user?.id || null,
        "LEAVE_BALANCE_MANUAL_RESET",
        "SYSTEM",
        null,
        `รีเซ็ตยอดวันลาด้วยตนเอง (ปีงบ ${year}${force ? ", force" : ""})`,
        null,
        req.user?.email || "ADMIN_MANUAL",
        { year, force: !!force }
      );
    } catch (logErr) {
      console.error("audit log (reset) ล้มเหลว:", logErr.message);
    }

    res.status(200).json({
      message: "รีเซ็ต Leave Balance สำเร็จ",
      details: "ข้อมูลปีก่อนถูกเก็บรักษาไว้เป็นประวัติ",
      year,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    console.error("❌ เกิดข้อผิดพลาดในการรีเซ็ต Leave Balance:", err);
    next(err);
  }
};

exports.getAvailableYears = async (req, res, next) => {
  try {
    const years = await LeaveBalanceService.getAvailableYears();

    res.status(200).json({
      message: "ดึงข้อมูลปีที่มีในระบบสำเร็จ",
      data: years,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    next(err);
  }
};

exports.deleteLeaveBalanceByYear = async (req, res, next) => {
  try {
    const { year } = req.params;

    const result = await LeaveBalanceService.deleteLeaveBalanceByYear(year);

    res.status(200).json({
      message: result.message,
      deletedCount: result.deletedCount,
      year: result.year,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    next(err);
  }
};

exports.getFiscalYearInfo = async (req, res, next) => {
  try {
    const fiscalYearSetting = await prisma.setting.findUnique({
      where: { key: "fiscalYear" },
    });

    const currentYearSetting = await prisma.setting.findUnique({
      where: { key: "currentYear" },
    });

    res.status(200).json({
      message: "ดึงข้อมูลปีงบประมาณสำเร็จ",
      data: {
        fiscalYear: fiscalYearSetting ? parseInt(fiscalYearSetting.value) : new Date().getFullYear(),
        currentYear: currentYearSetting ? parseInt(currentYearSetting.value) : new Date().getFullYear(),
      }
    });
  } catch (err) {
    next(err);
  }
};

exports.updateFiscalYear = async (req, res, next) => {
  try {
    const { fiscalYear, currentYear } = req.body;

    if (fiscalYear) {
      await prisma.setting.update({
        where: { key: "fiscalYear" },
        data: { value: String(fiscalYear) },
      });
    }

    if (currentYear) {
      await prisma.setting.update({
        where: { key: "currentYear" },
        data: { value: String(currentYear) },
      });
    }

    res.status(200).json({
      message: "อัปเดตข้อมูลปีงบประมาณสำเร็จ",
      data: { fiscalYear, currentYear }
    });
  } catch (err) {
    next(err);
  }
};

