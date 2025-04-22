const AdminService = require("../services/admin-service");
const LeaveRequestService = require("../services/leaveRequest-service");
const LeaveTypeService = require("../services/leaveType-service");
const LeaveBalanceService = require("../services/leaveBalance-service");
const OrgAndDeptService = require("../services/organizationAndDepartment-service");
const createError = require("../utils/createError");
const { sendEmail } = require("../utils/emailService");
const { calculateWorkingDays } = require("../utils/dateCalculate");
const RankService = require("../services/rank-service");
const bcrypt = require("bcryptjs");
const fs = require("fs");
const UserService = require("../services/user-service");
const cloudUpload = require("../utils/cloudUpload");

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

exports.createRequestByAdmin = async (req, res, next) => {
  try {
    const { leaveTypeId, startDate, endDate, reason, isEmergency, status } =
      req.body;
    // console.log("req.user.id = ", req.user.id);
    // console.log("Debug leaveTypeId con: ", leaveTypeId);
    // console.log("Debug req.user.id con: ", req.user.id);

    if (!leaveTypeId || !startDate || !endDate || !status) {
      console.log(
        "Debug createRequest leaveType, start, end",
        leaveTypeId,
        startDate,
        endDate,
        status
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

    const requestedDays = await calculateWorkingDays(start, end);

    const leaveBalance = await LeaveBalanceService.getUserBalance(
      req.user.id,
      leaveTypeId
    );

    // const requestedDays = Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1;
    if (requestedDays <= 0) {
      throw createError(400, "จำนวนวันลาต้องมากกว่า 0");
    }
    if (requestedDays > leaveBalance.maxDays - leaveBalance.usedDays) {
      return createError(400, "Leave balance is not enough");
    }

    if (!leaveBalance) {
      throw createError(404, `Leave balance not found`);
    }

    //not complete
    await LeaveBalanceService.updatePendingLeaveBalance(
      req.user.id,
      leaveTypeId,
      requestedDays
    );

    const leaveRequest = await AdminService.createLeaveRequestForUser(
      userId,
      leaveTypeId,
      startDate,
      endDate,
      reason,
      isEmergency,
      status.trim().toUpperCase()
    );

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

    res
      .status(201)
      .json({ message: "Leave request created", LeaveRequest: leaveRequest });
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

    res.status(200).json({
      message: "Updated holiday successfully",
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

    res.status(200).json({ message: "Deleted holiday successfully" });
  } catch (err) {
    next(err);
  }
};

//--------------------- Approver --------------------

exports.approverList = async (req, res, next) => {
  try {
    const approverList = await AdminService.approverList();

    if (!approverList) {
      console.log("Debug approverList: ", approverList);
      return createError(404, "approverList not found");
    }

    res.status(200).json({ message: "respones ok", approverList });
  } catch (err) {
    next(err);
  }
};

exports.createApprover = async (req, res, next) => {
  try {
    const { name } = req.body;

    // console.log('Debug name: ', name);
    if (!name) throw createError(400, "กรุณาใส่ชื่อ");

    const approver = await AdminService.createApprover(name);

    res
      .status(201)
      .json({ message: "เพิ่ม approver เรียบร้อย", Approver: approver });
  } catch (err) {
    next(err);
  }
};

exports.updateApprover = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name } = req.body;

    if (!id || !name) throw createError(400, "ไม่สามารถอัพเดตได้");
    if (isNaN(id)) throw createError(400, "ไอดีต้องเป็นตัวเลขเท่านั้น");

    const approver = await AdminService.updateApprover(parseInt(id), name);

    res.status(200).json({ message: "อัพเดตเรียบร้อย", Approver: approver });
  } catch (err) {
    next(err);
  }
};

exports.deleteApprover = async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!id) throw createError(400, "ไม่พบไอดี");
    if (isNaN(id)) throw createError(400, "ไอดีต้องเป็นตัวเลขเท่านั้น");

    const approver = await AdminService.deleteApprover(parseInt(id));

    res.status(200).json({ message: "ลบเรียบร้อยแล้ว" });
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
    const { name } = req.body;

    // console.log('Debug name: ', name);
    if (!name) throw createError(400, "กรุณาใส่ชื่อ");

    const role = await AdminService.createRole(name);

    res.status(201).json({ message: "เพิ่ม role เรียบร้อย", data: role });
  } catch (err) {
    next(err);
  }
};
exports.updateRole = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name } = req.body;

    if (!id || !name) throw createError(400, "ไม่สามารถอัพเดตได้");
    if (isNaN(id)) throw createError(400, "ไอดีต้องเป็นตัวเลขเท่านั้น");

    const role = await AdminService.updateRole(parseInt(id), name);

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

    const role = await AdminService.deleteRole(parseInt(id));

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
    const { departmentId, headId } = req.body;

    if (!departmentId || !headId) {
      throw createError(400, "departmentId and headId are required");
    }

    const roleName = "APPROVER_1";
    const [role] = await UserService.getRolesByNames([roleName]);
    if (!role) {
      console.log("Debug role: ", roleName);
      throw createError(400, "Invalid role provided");
    }

    const { headId: lastHeadId } = await UserService.getHeadIdByDepartmentId(departmentId);
    const userIdInt = parseInt(lastHeadId, 10);
    const roleIdInt = parseInt(role.id, 10);

    await UserService.deleteUserRole(userIdInt, roleIdInt);

    const updatedDepartment = await AdminService.assignHead(
      parseInt(departmentId),
      parseInt(headId)
    );

    const roleList = ["APPROVER_1"];
    const roles = await UserService.getRolesByNames(roleList);
    if (!roles || roles.length !== roleList.length) {
      console.log("Debug roles: ", roleList);
      throw createError(400, "Invalid roles provided");
    }
    await UserService.assignRolesToUser(
      headId,
      roles.map((role) => role.id)
    );

    res
      .status(200)
      .json({ message: "Assigned head successfully", data: updatedDepartment });
  } catch (err) {
    next(err);
  }
};

// --------------------
//        ranks
// --------------------

exports.getAllRank = async (req, res, next) => {
  try {
    const rank = await RankService.getAllRanks();
    if (!rank) throw createError(404, "ไม่พบข้อมูลของ rank");
    res.status(200).json({ message: "ดึงข้อมูล rank ทั้งหมดแล้ว", data: rank });
  } catch (err) {
    next(err);
  }
};

exports.getRankById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const rank = await RankService.getRankById(parseInt(id));
    if (!rank) throw createError(404, "ไม่พบข้อมูลของ rank");
    res
      .status(200)
      .json({ message: "ดึงข้อมูล rank เรียบร้อยแล้ว", data: rank });
  } catch (err) {
    next(err);
  }
};

exports.createRank = async (req, res, next) => {
  try {
    const {
      rank,
      minHireMonths,
      maxHireMonths,
      receiveDays,
      maxDays,
      isBalance,
      personnelTypeId,
      leaveTypeId,
    } = req.body;
    if (
      rank === undefined ||
      minHireMonths === undefined ||
      maxHireMonths === undefined ||
      receiveDays === undefined ||
      maxDays === undefined ||
      isBalance === undefined ||
      personnelTypeId === undefined ||
      leaveTypeId === undefined
    )
      throw createError(
        400,
        "กรุณากรอกข้อมูลให้ครบถ้วนก่อนทำการสร้าง rank ใหม่"
      );
    const personnelType = await OrgAndDeptService.getPersonnelTypeById(
      personnelTypeId
    );
    if (!personnelType) throw createError(404, "ไม่พบข้อมูล personnelType");

    const leaveType = await LeaveTypeService.getLeaveTypeById(leaveTypeId);
    if (!leaveType) throw createError(404, "ไม่พบข้อมูล leaveType");

    const data = {
      rank,
      minHireMonths,
      maxHireMonths,
      receiveDays,
      maxDays,
      isBalance,
      personnelTypeId,
      leaveTypeId,
    };

    const ranks = await RankService.createRank(data);
    if (!ranks) throw createError(400, "สร้าง rank ไม่สำเร็จ");
    res.status(201).json({ message: "สร้าง rank สำเร็จแล้ว", data: ranks });
  } catch (err) {
    next(err);
  }
};

exports.updateRank = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { updateData } = req.body;
    if (!id) throw createError(404, "ไม่พบ id");
    const rank = await RankService.updateRank(parseInt(id), updateData);
    if (!rank) throw createError(400, "ไม่สามารถอัปเดต rank ได้");
    res.status(200).json({ message: "อัปเดต rank เหรียบร้อยแล้ว", data: rank });
  } catch (err) {
    next(err);
  }
};

exports.deleteRank = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!id) throw createError(404, "ไม่พบ id");
    await RankService.deleteRank(parseInt(id));
    res.status(200).json({ message: "ลบ rank เรียบร้อยแล้ว" });
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
    res.status(201).json({
      message: "สร้างประเภทบุคคลากรเรียบร้อยแล้ว",
      data: personnelType,
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
    const personnelType = await OrgAndDeptService.updatePersonnelType(
      parseInt(id),
      name
    );
    if (!personnelType) throw createError(400, "อัปเดตประเภทบุคคลากรไม่สำเร็จ");
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
    await OrgAndDeptService.deletePersonnelType(parseInt(id));
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

    const data = {
      name,
      organizationId: +organizationId,
      headId: headId != null ? +headId : null,
      appointDate: appointDate ? new Date(appointDate) : null,
    };

    const newDept = await AdminService.createDepartment(data);
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

    const { name, organizationId, headId, appointDate } = req.body;
    if (!name && !organizationId && headId == null && !appointDate) {
      throw createError(400, "ไม่มีข้อมูลจะอัปเดต");
    }

    const updateData = {};
    if (name) updateData.name = name;
    if (organizationId) updateData.organizationId = +organizationId;
    if (headId !== undefined) updateData.headId = headId ? +headId : null;
    if (appointDate) updateData.appointDate = new Date(appointDate);

    const updated = await AdminService.updateDepartment({ id, ...updateData });
    if (!updated) throw createError(404, "ไม่พบแผนกที่จะอัปเดต");

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

    await AdminService.deleteDepartment(id);
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
      password,
      phone,
      position,
      hireDate,
      inActiveRaw = "false",
      employmentType,
      personnelTypeId,
      departmentId,
    } = req.body;

    // ✅ Validation
    if (!email || !password || !firstName || !lastName) {
      throw createError(400, "กรุณากรอกข้อมูลที่จำเป็นให้ครบถ้วน");
    }

    if (!email.endsWith("@rmuti.ac.th")) {
      throw createError(400, "อีเมลต้องอยู่ในโดเมน rmuti.ac.th เท่านั้น");
    }

    const exists = await UserService.getUserByEmail(email);
    if (exists) {
      throw createError(400, "อีเมลนี้มีผู้ใช้งานในระบบแล้ว");
    }

    const passLetters = (password.match(/[a-zA-Z]/g) || []).length;
    if (password.length < 8 || passLetters < 4) {
      throw createError(
        400,
        "รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร และมีตัวอักษรอย่างน้อย 4 ตัว"
      );
    }

    if (!["ACADEMIC", "SUPPORT"].includes(employmentType)) {
      throw createError(400, "ประเภทพนักงานไม่ถูกต้อง");
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const user = await UserService.createUser({
      prefixName,
      firstName,
      lastName,
      sex,
      email,
      password: passwordHash,
      phone,
      position,
      hireDate: hireDate ? new Date(hireDate) : null,
      inActive: inActiveRaw === "true",
      employmentType,
      personnelTypeId: parseInt(personnelTypeId),
      departmentId: parseInt(departmentId),
    });

    // ✅ Profile Picture (Optional)
    if (req.file) {
      const imgUrl = await cloudUpload(req.file.path);
      await UserService.createUserProfile(user.id, imgUrl);
      fs.unlink(req.file.path, () => {});
    }

    // ✅ Default Role = USER
    const roles = await UserService.getRolesByNames(["USER"]);
    await UserService.assignRolesToUser(
      user.id,
      roles.map((r) => r.id)
    );

    return res
      .status(201)
      .json({ message: "สร้างผู้ใช้งานใหม่เรียบร้อยแล้ว", data: user });
  } catch (err) {
    next(err);
  }
};

exports.updateUserById = async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) throw createError(400, "ID ต้องเป็นตัวเลข");

    const {
      prefixName,
      firstName,
      lastName,
      email,
      phone,
      sex,
      position,
      hireDate,
      inActiveRaw,
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
      inActive: inActiveRaw === "true",
      employmentType,
      personnelTypeId: parseInt(personnelTypeId),
      departmentId: parseInt(departmentId),
    };

    const updatedUser = await AdminService.updateUserById(id, updateData);
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

    await AdminService.deleteUserById(id);
    res.status(200).json({ message: "ลบผู้ใช้เรียบร้อยแล้ว" });
  } catch (err) {
    next(err);
  }
};
