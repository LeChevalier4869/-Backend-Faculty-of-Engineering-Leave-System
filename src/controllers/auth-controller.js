const UserService = require("../services/user-service");
const OrgAndDeptService = require("../services/organizationAndDepartment-service");
const createError = require("../utils/createError");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const cloudUpload = require("../utils/cloudUpload");
const multer = require("multer");
const upload = multer();
const { sendEmail } = require("../utils/emailService");
const { isCorporateEmail } = require("../utils/checkEmailDomain");
const { isAllowedEmailDomain } = require("../utils/emailDomainChecker");
const fs = require("fs");

// controller/auth-controller.js
exports.register = async (req, res, next) => {
  try {
    const {
      prefixName,
      firstName,
      lastName,
      sex,
      email,
      password,
      phone,
      roleNames,
      position,
      hireDate,
      inActiveRaw = "false",
      employmentType,
      personnelTypeId,
      departmentId,
    } = req.body;

    // ✅ ตรวจสอบ email และ password
    if (!email || !password) {
      throw createError(400, "กรุณากรอกอีเมลและรหัสผ่าน");
    }

    // ✅ ตรวจสอบ domain email
    if (!isAllowedEmailDomain(email)) {
      throw createError(400, "อีเมลต้องอยู่ในโดเมน rmuti.ac.th เท่านั้น");
    }

    // ✅ ตรวจสอบเบอร์โทรศัพท์
    validatePhone(phone);

    // ✅ ตรวจสอบความซับซ้อนของรหัสผ่าน
    const letterCount = (password.match(/[a-zA-Z]/g) || []).length;
    if (String(password).length < 8 || letterCount < 4) {
      throw createError(
        400,
        "รหัสผ่านต้องมีความยาวมากกว่า 8 ตัวอักษร และต้องมีตัวอักษรอย่างน้อย 4 ตัว"
      );
    }

    // ✅ ตรวจสอบว่ามีผู้ใช้นี้อยู่แล้วหรือไม่
    const userExist = await UserService.getUserByEmail(email);
    if (userExist) {
      throw createError(400, "มีบัญชีที่ใช้อีเมลนี้แล้ว");
    }

    // ✅ Hash password
    const passwordHash = await bcrypt.hash(password, 10);

    // ✅ ตรวจสอบประเภทพนักงาน
    const employmentTypeMap = {
      ACADEMIC: "ACADEMIC",
      SUPPORT: "SUPPORT",
    };

    const mapEmploymentType = employmentTypeMap[employmentType] || null;
    if (!mapEmploymentType) {
      throw createError(400, "ประเภทพนักงานไม่ถูกต้อง");
    }

    // ✅ แปลง hireDate ถ้ามีค่า
    const parsedHireDate = hireDate ? new Date(hireDate) : null;

    // ✅ สร้างผู้ใช้
    const newUser = await UserService.createUser({
      prefixName,
      firstName,
      lastName,
      sex,
      email,
      password: passwordHash,
      phone,
      position,
      hireDate: parsedHireDate,
      inActive: inActiveRaw === "true",
      employmentType: mapEmploymentType,
      personnelTypeId: parseInt(personnelTypeId),
      departmentId: parseInt(departmentId),
    });

    // ✅ อัปโหลดโปรไฟล์
    const file = req.file;
    if (file) {
      const imgUrl = await cloudUpload(file.path);
      await UserService.createUserProfile(newUser.id, imgUrl);
      fs.unlink(file.path, () => {});
    }

    // ✅ กำหนดบทบาท
    const roleList = ["USER"];
    const roles = await UserService.getRolesByNames(roleList);
    if (!roles || roles.length !== roleList.length) {
      console.log("Debug roles: ", roleList);
      throw createError(400, "Invalid roles provided");
    }

    await UserService.assignRolesToUser(
      newUser.id,
      roles.map((role) => role.id)
    );

    // ✅ กำหนด Rank ตาม personnelType
    await UserService.assignRankToUser(
      newUser.id,
      personnelTypeId,
      parsedHireDate
    );

    // ✅ gen balance ของ ลาป่วย ลากิจ ลาพัก ตาม rank ที่ได้
    await UserService.assignLeaveBalanceFromRanks(newUser.id);

    // ✅ ส่ง response
    res.status(201).json({ message: "ลงทะเบียนผู้ใช้สำเร็จ" });
  } catch (err) {
    if (err.code === 11000) {
      next(createError(400, "อีเมลนี้มีอยู่ในระบบแล้ว"));
    } else {
      next(err);
    }
  }
};

exports.login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password)
      throw createError(400, "กรุณากรอกอีเมลและรหัสผ่าน");

    if (!isCorporateEmail(email)) {
      return createError(403, "อนุญาตให้ล็อกอินด้วยอีเมลมหาวิทยาลัยเท่านั้น");
    }

    const user = await UserService.getUserByEmail(email);
    //console.log(user)

    if (!user) {
      return createError(404, "User not found");
    }

    // จำเป็นต้องนำเข้าฐานข้อมูลก่อน แล้วรหัสจะทำยังไง?
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return createError(401, "Invalid email or password");
    }
    // console.log('isMatch = ' + isMatch);
    // console.log('password = ' + password);
    // console.log('user pass = ' + user.password);

    const userWithRoles = await UserService.getUserByIdWithRoles(user.id);
    const roles = userWithRoles.userRoles.map((userRole) => userRole.role.name);

    const departments = await UserService.getDepartment(user.id);
    const organization = await UserService.getOrganization(user.id);
    const personnelType = await UserService.getPersonnelType(user.id);

    // console.log("Debug department: ", departments);
    // console.log("Debug organization: ", organization);
    // console.log("Debug personnelType: ", personnelType);

    const token = jwt.sign(
      {
        id: user.id,
        email: user.email,
        prefixName: user.prefixName,
        firstName: user.firstName,
        lastName: user.lastName,
        sex: user.sex,
        role: roles,
        phone: user.phone,
        organization: organization,
        department: departments,
        // isHeadOfDepartment: ตรวจสอบว่า user เป็นหัวหน้าของสาขานี้หรือไม่,
        personnelType: personnelType,
        hireDate: user.hireDate,
        inActive: user.inActive,
        employmentType: user.employmentType,
        profilePicturePath: user.profilePicturePath,
      },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRESIN }
    );
    res.status(200).json({ token });
  } catch (err) {
    next(err);
  }
};

exports.getMe = async (req, res, next) => {
  try {
    res.status(200).json(req.user);
  } catch (err) {
    next(err);
  }
};

exports.userLanding = async (req, res) => {
  try {
    const user = await UserService.getUserLanding();

    if (!user || user.length === 0) {
      return createError(400, "User not found");
    }

    //console.log("user = ", user);

    res.status(200).json({ user });
  } catch (err) {
    res.status(500).json({ error: "Error from controller user landing" });
  }
};

//error
exports.updateProfile = async (req, res, next) => {
  try {
    const userEmail = req.user.email;
    const { profilePicturePath } = req.body;

    let updateProfilePicturePath = null;
    if (req.file) {
      updateProfilePicturePath = await cloudUpload(req.file.path);
    }

    const updatedUser = await UserService.updateUser(userEmail, {
      profilePicturePath: updateProfilePicturePath || profilePicturePath,
    });

    res.status(200).json({
      message: "Profile picture updated",
      user: updatedUser,
    });
  } catch (err) {
    next(err);
  }
};

exports.updateUserRole = async (req, res, next) => {
  const userId = parseInt(req.params.id);
  const { roleNames, action } = req.body;

  try {
    if (!userId || isNaN(userId)) {
      return createError(400, "Invalid user ID");
    }
    if (!roleNames) {
      return createError(400, "Role names are required");
    }

    const rolesArray = Array.isArray(roleNames) ? roleNames : [roleNames];
    const userRole = rolesArray.map((role) => role.toUpperCase());
    const roles = await UserService.getRolesByNames(userRole);

    //    console.log('roles array = ' + rolesArray);
    //    console.log('user role = ' + userRole);
    //   console.log('roles = ' + roles);

    if (!roles || roles.length !== userRole.length) {
      throw createError(400, "Invalid roles provided");
    }

    let updatedRole;
    if (action === "ADD") {
      updatedRole = await UserService.addUserRoles(
        userId,
        roles.map((role) => role.id)
      );
    } else if (action === "REMOVE") {
      updatedRole = await UserService.removeUserRoles(
        userId,
        roles.map((role) => role.id)
      );
    } else {
      throw createError(400, "Invalid action. Use 'ADD' or 'REMOVE'");
    }

    //email
    const user = await UserService.getUserByIdWithRoles(userId);

    if (user) {
      const userEmail = user.email;
      const userName = `${user.prefixName} ${user.firstName} ${user.lastName}`;
      const newRoles = roles.map((role) => role.name);

      const subject = "บทบาทของคุณได้รับการอัพเดตแล้ว!";
      const message = `
                <h3>สวัสดี ${userName}</h3>
                <p>บทบาทของคุณได้รับการอัพเดตแล้ว</p>
                <p><strong>บทบาทใหม่:</strong> ${newRoles.join(",")}</p>
                <br/>
                <p>ขอแสดงความนับถือ</p>
                <p>ระบบจัดการวันลาคณะวิศวกรรมศาสตร์</p>
            `;
      await sendEmail(userEmail, subject, message);
    }

    res.status(200).json({ message: "User role updated", roles: updatedRole });
  } catch (err) {
    next(err);
  }
};

exports.updateUser = async (req, res, next) => {
  try {
    const userId = req.user.id;
    // * admin can update only
    const {
      prefixName,
      firstName,
      lastName,
      sex,
      email,
      phone,
      hireDate, // *
      inActive, // *
      employmentType, // *
      personnelTypeId, // *
      departmentId, // *
      organizationId, // *
    } = req.body;

    if (!userId || isNaN(userId)) {
      return createError(400, "Invalid user ID");
    }

    //const file = req.file;

    const user = req.user;
    console.log("Debug role: ", user.role);

    const userRole = Array.isArray(user.role) ? user.role : [user.role];

    let updateData = {};

    validatePhone(phone);

    if (userRole.includes("ADMIN")) {
      updateData = {
        prefixName,
        firstName,
        lastName,
        sex,
        email,
        phone,
        hireDate: new Date(hireDate),
        inActive: Boolean(inActive),
        employmentType,
        personnelType: {
          connect: { id: parseInt(personnelTypeId) }, // เชื่อมโยง personnelType
        },
        department: {
          connect: { id: parseInt(departmentId) }, // เชื่อมโยง personnelType
        },
        // organization: {  // เชื่อมโยง organization แทน organizationId
        //   connect: { id: parseInt(organizationId) },
        // },
      };
    } else if (userRole.includes("USER")) {
      updateData = {
        prefixName,
        firstName,
        lastName,
        sex,
        email,
        phone,
      };
    } else {
      return createError(403, "Permission denied");
    }

    if (req.file) {
      const fileUrl = await cloudUpload(req.file.path);
      updateData.profilePicturePath = fileUrl;
    }

    if (!departmentId) {
      console.log("Debug dep, org id: ", departmentId);
      return createError(400, "Required department field");
    }
    // if (!departmentId || !organizationId) {
    //   console.log("Debug dep, org id: ", departmentId, organizationId);
    //   return createError(400, "Required department or organization ID field");
    // }

    //console.log(sex,email)
    if (
      !sex ||
      !email ||
      !hireDate ||
      !inActive ||
      !personnelTypeId ||
      !employmentType
    ) {
      return createError(400, "Required fields are missing");
    }

    const updateUser = await UserService.updateUserById(
      userId,
      updateData,
      departmentId,
      organizationId
    );

    res.status(200).json({ message: "User updated", user: updateUser });
  } catch (err) {
    next(err);
  }
};

exports.updateUserStatus = async (req, res, next) => {
  try {
    const userId = parseInt(req.params.id);
    const { inActive } = req.body;
    // const inActived = Boolean(inActive);

    if (!userId || isNaN(userId)) {
      return createError(400, "Invalid user ID");
    }

    // console.log('in active = ' + inActive);
    // console.log('in actived = ' + inActived);

    const inActived = inActive === "true" || inActive === true;

    if (typeof inActived !== "boolean") {
      return createError(400, "Invalid inActive");
    }

    const updateUserStatus = await UserService.updateUserStatusById(
      userId,
      inActived
    );

    res
      .status(200)
      .json({ message: "User status updated", user: updateUserStatus });
  } catch (err) {
    next(err);
  }
};

exports.checkUserRole = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const userRole = await UserService.getUserByIdWithRoles(userId);

    if (!userRole) {
      console.log("Debug userRole", userRole.role);
      throw createError(404, "User role not found");
    }
    console.log(userRole);

    res.status(200).json({ message: "User role checked", role: userRole.role });
  } catch (err) {
    next(err);
  }
};

exports.getUserInfoById = async (req, res, next) => {
  try {
    const userId = parseInt(req.params.id);
    if (!userId || isNaN(userId)) {
      throw createError(400, "Invalid user id");
    }

    const userInfo = await UserService.getUserInfoById(userId);

    if (!userInfo) {
      throw createError(400, "user info not found");
    }

    res.status(200).json({ user: userInfo });
  } catch (err) {
    next(err);
  }
};

//googleLoing ยังไม่เสร็จ
// exports.googleLogin = async (req, res, next) => {
//   try {
//     const { email } = req.user; // from google OAuth
//     if (!email.endsWith("@rmuti.ac.th")) {
//       throw createError(403, "อนุญาตเฉพาะบัญชี @rmuti.ac.th");
//     }

//     // check user exist
//     let user = await UserService.getUserByEmail(email);

//     // if not - create new account (create new password / user do this)
//     if (!user) {
//       user = await UserService.createUser({
//         email,
//         password: null, //wait for user
//         isGoogleAccount: true,
//       });
//       return res.status(201).json({
//         message: "กรุณาตั้งรหัสผ่าน",
//         tempUserId: user.id,
//       });
//     }

//     const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET);
//     res.json({ token });
//   } catch (err) {
//     next(err);
//   }
// };

// exports.setPassword = async (req, res, next) => {
//   try {
//     const { tempUserId, password } = req.body;
//     const hashedPassword = await bcrypt.hash(password, 10);

//     await UserService.updateUserById(tempUserId, {
//       password: hashedPassword,
//       isGoogleAccount: false,
//     });

//     res.json({ message: "ตั้งรหัสผ่านสำเร็จ" });
//   } catch (err) {
//     next(err);
//   }
// };

//Organizations---------------------------------------------------------------------------------------------------
exports.getAllOrganizations = async (req, res, next) => {
  try {
    const organizations = await OrgAndDeptService.getAllOrganizations();

    if (!organizations || organizations.length === 0) {
      console.log("ข้อมูลองค์กร: ", organizations);
      throw createError(404, "ไม่พบข้อมูลองค์กร");
    }

    res.status(200).json({ message: "สำเร็จ", data: organizations });
  } catch (err) {
    next(err);
  }
};

exports.getOrganizationById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const organization = await OrgAndDeptService.getOrganizationById(id);

    if (!organization) {
      console.log("ข้อมูลองค์กร: ", organization);
      throw createError(404, "ไม่พบข้อมูลองค์กร");
    }

    res.status(200).json({ message: "สำเร็จ", data: organization });
  } catch (err) {
    next(err);
  }
};

exports.createOrganization = async (req, res, next) => {
  try {
    const { name } = req.body;
    if (!name) {
      throw createError(400, "กรุณากรอกชื่อองค์กร");
    }

    const newOrganization = await OrgAndDeptService.createOrganization(name);

    res
      .status(201)
      .json({ message: "สร้างองค์กรสำเร็จ", data: newOrganization });
  } catch (err) {
    next(err);
  }
};

exports.updateOrganization = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name } = req.body;

    if (!name) {
      throw createError(400, "กรุณากรอกชื่อองค์กร");
    }

    const updatedOrganization = await OrgAndDeptService.updateOrganization(
      id,
      name
    );

    if (!updatedOrganization) {
      throw createError(404, "ไม่พบข้อมูลองค์กร");
    }

    res
      .status(200)
      .json({ message: "อัปเดตข้อมูลองค์กรสำเร็จ", data: updatedOrganization });
  } catch (err) {
    next(err);
  }
};

exports.deleteOrganization = async (req, res, next) => {
  try {
    const { id } = req.params;
    const deletedOrganization = await OrgAndDeptService.deleteOrganization(id);

    if (!deletedOrganization) {
      throw createError(404, "ไม่พบข้อมูลองค์กร");
    }

    res
      .status(200)
      .json({ message: "ลบองค์กรสำเร็จ", data: deletedOrganization });
  } catch (err) {
    next(err);
  }
};

exports.getOrganizationAndDepartment = async (req, res, next) => {
  try {
    const organizationAndDepartment =
      await OrgAndDeptService.getOrganizationAndDepartment();

    if (!organizationAndDepartment) {
      console.log(
        "Debug organizationAndDepartment: ",
        organizationAndDepartment
      );
      throw createError(404, "not found");
    }

    res.status(200).json({ message: "ok", data: organizationAndDepartment });
  } catch (err) {
    next(err);
  }
};

//Departments---------------------------------------------------------------------------------------------------
exports.getAllDepartments = async (req, res, next) => {
  try {
    const departments = await OrgAndDeptService.getAllDepartments();

    if (!departments || departments.length === 0) {
      console.log("ข้อมูลองค์กร: ", departments);
      throw createError(404, "ไม่พบข้อมูลแผนก");
    }

    res.status(200).json({ message: "สำเร็จ", data: departments });
  } catch (err) {
    next(err);
  }
};

exports.getDepartmentById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const department = await OrgAndDeptService.getDepartmentById(id);

    if (!department) {
      console.log("ข้อมูลองค์กร: ", department);
      throw createError(404, "ไม่พบข้อมูลแผนก");
    }

    res.status(200).json({ message: "สำเร็จ", data: department });
  } catch (err) {
    next(err);
  }
};

exports.createDepartment = async (req, res, next) => {
  try {
    const { name, headId, organizationId, appointDate } = req.body;
    if (!name || !organizationId) {
      throw createError(400, "กรุณากรอกชื่อแผนกและ ID ขององค์กร");
    }

    const newDepartment = await OrgAndDeptService.createDepartment({
      name,
      headId,
      organizationId,
      appointDate,
    });

    res.status(201).json({ message: "สร้างแผนกสำเร็จ", data: newDepartment });
  } catch (err) {
    next(err);
  }
};

exports.updateDepartment = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, headId, organizationId, appointDate } = req.body;

    if (!name || !organizationId) {
      throw createError(400, "กรุณากรอกชื่อแผนกและ ID ขององค์กร");
    }

    const updatedDepartment = await OrgAndDeptService.updateDepartment(id, {
      name,
      headId,
      organizationId,
      appointDate,
    });

    if (!updatedDepartment) {
      throw createError(404, "ไม่พบแผนกที่ต้องการอัปเดต");
    }

    res
      .status(200)
      .json({ message: "อัปเดตแผนกสำเร็จ", data: updatedDepartment });
  } catch (err) {
    next(err);
  }
};

exports.deleteDepartment = async (req, res, next) => {
  try {
    const { id } = req.params;
    const deletedDepartment = await OrgAndDeptService.deleteDepartment(id);

    if (!deletedDepartment) {
      throw createError(404, "ไม่พบแผนกที่ต้องการลบ");
    }

    res.status(200).json({ message: "ลบแผนกสำเร็จ", data: deletedDepartment });
  } catch (err) {
    next(err);
  }
};

// ฟังก์ชันสำหรับ validate phone
const validatePhone = (phone) => {
  const phoneRegex = /^[0-9]{1,10}$/; // รับเฉพาะตัวเลข ไม่เกิน 10 หลัก
  if (!phone || !phoneRegex.test(phone)) {
    throw createError(400, "หมายเลขโทรศัพท์ต้องเป็นตัวเลขและไม่เกิน 10 หลัก");
  }
  return true;
};

//PersonnelTypes---------------------------------------------------------------------------------------------------
exports.getPersonnelTypes = async (req, res, next) => {
  try {
    const personnelTypes = await OrgAndDeptService.getAllPersonnelTypes();

    if (!personnelTypes || personnelTypes.length === 0) {
      throw createError(404, "Personnel types not found");
    }

    res.status(200).json({ message: "response ok", data: personnelTypes });
  } catch (err) {
    next(err);
  }
};

exports.getPersonnelTypeById = async (req, res, next) => {
  try {
    const personnelType = await OrgAndDeptService.getPersonnelTypeById(
      parseInt(req.params.id)
    );

    if (!personnelType) {
      throw createError(404, "Personnel type not found");
    }

    res.status(200).json({ message: "response ok", data: personnelType });
  } catch (err) {
    next(err);
  }
};

exports.createPersonnelType = async (req, res, next) => {
  try {
    const { name } = req.body;

    if (!name) {
      throw createError(400, "Name is required");
    }

    const personnelType = await OrgAndDeptService.createPersonnelType({ name });

    res.status(201).json({
      message: "Personnel type created successfully",
      data: personnelType,
    });
  } catch (err) {
    next(err);
  }
};

exports.updatePersonnelType = async (req, res, next) => {
  try {
    const { name } = req.body;
    const { id } = req.params;

    if (!name) {
      throw createError(400, "Name is required");
    }

    const updatedPersonnelType = await OrgAndDeptService.updatePersonnelType(
      parseInt(id),
      { name }
    );

    if (!updatedPersonnelType) {
      throw createError(404, "Personnel type not found");
    }

    res.status(200).json({
      message: "Personnel type updated successfully",
      data: updatedPersonnelType,
    });
  } catch (err) {
    next(err);
  }
};

exports.deletePersonnelType = async (req, res, next) => {
  try {
    const { id } = req.params;

    const deletedPersonnelType = await OrgAndDeptService.deletePersonnelType(
      parseInt(id)
    );

    if (!deletedPersonnelType) {
      throw createError(404, "Personnel type not found");
    }

    res.status(200).json({
      message: "Personnel type deleted successfully",
      data: deletedPersonnelType,
    });
  } catch (err) {
    next(err);
  }
};

exports.adminCreateUser = async (req, res, next) => {
  try {
    // 1. รับค่า
    const {
      prefixName,
      firstName,
      lastName,
      email,
      phone,
      password,
      personnelTypeId,
      departmentId,
      organizationId,
      employmentType,
      hireDate,
      roleNames = "USER",
      inActiveRaw = "false",
    } = req.body;

    // 2. validate (ตัวอย่างสั้น ๆ)
    if (!email || !password || !firstName) {
      return res.status(400).json({ message: "ข้อมูลไม่ครบ" });
    }

    // 3. check duplicate
    const exist = await prisma.user.findUnique({ where: { email } });
    if (exist) return res.status(409).json({ message: "อีเมลซ้ำ" });

    // 4. hash password
    const hashed = await bcrypt.hash(password, 12);

    // 5. อัปโหลดรูปถ้ามี
    const avatar = req.file ? await uploadImage(req.file) : null;

    // 6. create user
    const user = await prisma.user.create({
      data: {
        prefixName,
        firstName,
        lastName,
        email,
        phone,
        password: hashed,
        personnelTypeId: +personnelTypeId || null,
        departmentId: +departmentId || null,
        organizationId: +organizationId || null,
        employmentType,
        hireDate: hireDate ? new Date(hireDate) : null,
        inActive: inActiveRaw === "true",
        roleNames: Array.isArray(roleNames) ? roleNames : [roleNames],
        profilePicture: avatar,
      },
    });

    res.status(201).json({ message: "สร้างผู้ใช้สำเร็จ", data: user });
  } catch (err) {
    next(err);
  }
};

//reset password-----------------------------------------------------------------------
exports.changePassword = async (req, res) => {
  try {
    const result = await UserService.changePassword(req.body);
    res.json({ success: true, message: result });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

exports.forgotPassword = async (req, res) => {
  try {
    const result = await UserService.forgotPassword(req.body.email);
    res.json({ success: true, message: result });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

exports.resetPassword = async (req, res) => {
  try {
    const result = await UserService.resetPassword(req.body);
    res.json({ success: true, message: result });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};
