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
      roleNames = ["USER"],
      hireDate,
      inActive,
      employmentType,
      personnelTypeId,
      departmentId,
      organizationId,
    } = req.body;

    if (!email || !password) {
      throw createError(400, "กรุณากรอกอีเมลและรหัสผ่าน");
    }

    validatePhone(phone);

    const letterCount = (password.match(/[a-zA-Z]/g) || []).length;
    if (String(password).length < 8 || letterCount < 5) {
      throw createError(
        400,
        "รหัสผ่านต้องมีความยาวมากกว่า 8 ตัวอักษร และต้องมีตัวอักษรอย่างน้อย 5 ตัว"
      );
    }

    const userExist = await UserService.getUserByEmail(email);
    if (userExist) {
      throw createError(400, "มีบัญชีที่ใช้อีเมลนี้แล้ว");
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const employmentTypeMap = {
      ACADEMIC: "ACADEMIC",
      SUPPORT: "SUPPORT",
    };

    const mapEmploymentType = employmentTypeMap[employmentType] || null;
    if (!mapEmploymentType) {
      throw createError(400, "ประเภทพนักงานไม่ถูกต้อง");
    }

    const newUser = await UserService.createUser({
      prefixName,
      firstName,
      lastName,
      sex,
      email,
      password: passwordHash,
      phone,
      hireDate,
      inActive,
      employmentType: mapEmploymentType,
      personnelTypeId: parseInt(personnelTypeId),
      departmentId: parseInt(departmentId),
      organizationId: parseInt(organizationId),
    });

    // upload profile picture
    const file = req.file;
    if (file) {
      const imgUrl = await cloudUpload(file.path);
      await UserService.createUserProfile(newUser.id, imgUrl);
    }

    const roles = await UserService.getRolesByNames(roleNames);
    if (!roles || roles.length !== roleNames.length) {
      throw createError(400, "Invalid roles provided");
    }

    await UserService.assignRolesToUser(
      newUser.id,
      roles.map((role) => role.id)
    );

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

    if (!email) {
      return createError(400, "กรุณากรอกอีเมล");
    }

    if (!password) {
      return createError(400, "กรุณากรอกรหัสผ่าน");
    }

    if (!isCorporateEmail(email)) {
      return createError(403, "อนุญาตให้ล็อกอินด้วยอีเมลมหาวิทยาลัยเท่านั้น");
    }

    const user = await UserService.getUserByEmail(email);

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
    const roles = userWithRoles.user_role.map(
      (userRole) => userRole.roles.name
    );

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
      updatedRole = await UserService.addUserRoles(userId, roles.map((role) => role.id))
    } else if (action === "REMOVE") {
      updatedRole = await UserService.removeUserRoles(userId, roles.map((role) => role.id))
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
        personnelTypeId: parseInt(personnelTypeId),
        departmentId: parseInt(departmentId),
        organizationId: parseInt(organizationId),
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

    if (!departmentId || !organizationId) {
      console.log("Debug dep, org id: ", departmentId, organizationId);
      return createError(400, "Required department or organization ID field");
    }

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

exports.getOrganization = async (req, res, next) => {
  try {
    const organization = await OrgAndDeptService.getAllOrganization();

    if (!organization) {
      console.log("Debug organization: ", organization);
      throw createError(404, "not found");
    }

    res.status(200).json({ message: "ok", data: organization });
  } catch (err) {
    next(err);
  }
};

exports.getDepartment = async (req, res, next) => {
  try {
    const organizationId = parseInt(req.params.id);
    const department = await OrgAndDeptService.getDepartmentById(organizationId);

    if (!organizationId) {
      throw createError(404, "org not found");
    }

    if (!department) {
      console.log("Debug organization: ", department);
      throw createError(404, "not found");
    }

    res.status(200).json({ message: "ok", data: department });
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

exports.getPersonnelType = async (req, res, next) => {
  try {
    const personnelType = await OrgAndDeptService.getPersonnelType();

    if (!personnelType) {
      throw createError(404, "personnel type not found");
    }

    res.status(200).json({ message: "response ok", data: personnelType });
  } catch (err) {
    next(err);
  }
};
