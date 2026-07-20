const UserService = require("../services/user-service");
const AdminService = require("../services/admin-service");
const OrgAndDeptService = require("../services/organizationAndDepartment-service");
const AuditLogService = require("../services/auditLog-service");
const createError = require("../utils/createError");
const jwt = require("jsonwebtoken");
const cloudUpload = require("../utils/cloudUpload");
const multer = require("multer");
const upload = multer();
const { sendNotification } = require("../utils/emailService");
const { isCorporateEmail } = require("../utils/checkEmailDomain");
const { isAllowedEmailDomain } = require("../utils/emailDomainChecker");
const prisma = require("../config/prisma");
const fs = require("fs");
const path = require("path");

// Memory-based rate limiting for profile picture uploads
const profileUploadRateLimit = new Map(); // userId -> { count: number, lastUpload: Date }

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

exports.getVerifier = async (req, res, next) => {
  try {
    const verifier = await UserService.getVerifier();

    if (!verifier || verifier.length === 0) {
      return createError(500, "verifier not found");
    }

    res.status(200).json({ verifier });
  } catch (error) {
    next(error);
  }
};

exports.updateProfile = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { profilePicturePath } = req.body;

    // Memory-based rate limiting: Check if user has uploaded more than 3 times today
    if (req.file) {
      const today = new Date();
      today.setHours(0, 0, 0, 0); // Start of today

      const userRateLimit = profileUploadRateLimit.get(userId);
      
      if (userRateLimit) {
        const lastUploadDate = new Date(userRateLimit.lastUpload);
        lastUploadDate.setHours(0, 0, 0, 0);

        if (lastUploadDate.getTime() === today.getTime()) {
          // Same day, check count
          if (userRateLimit.count >= 3) {
            return res.status(429).json({
              error: "คุณสามารถอัปโหลดรูปโปรไฟล์ได้สูงสุด 3 ครั้งต่อวัน กรุณาลองใหม่ในวันพรุ่ง"
            });
          }

          // Increment count for same day
          userRateLimit.count += 1;
          userRateLimit.lastUpload = new Date();
        } else {
          // New day, reset count
          userRateLimit.count = 1;
          userRateLimit.lastUpload = new Date();
        }
      } else {
        // First upload ever
        profileUploadRateLimit.set(userId, {
          count: 1,
          lastUpload: new Date()
        });
      }
    }

    let updateProfilePicturePath = null;
    
    if (req.file) {
      // For local development, use file path
      if (process.env.NODE_ENV !== 'production') {
        updateProfilePicturePath = `/uploads/profile/${req.file.filename}`;
      } else {
        // For production, upload to Cloudinary
        updateProfilePicturePath = await cloudUpload(req.file.path);
        // Clean up local file after upload
        fs.unlink(req.file.path, () => {});
      }
    }

    const updatedUser = await AdminService.updateUserById(userId, {
      profilePicturePath: updateProfilePicturePath || profilePicturePath,
    });

    res.status(200).json({
      message: "อัปเดตรูปโปรไฟล์",
      user: updatedUser,
    });
  } catch (err) {
    next(err);
  }
};

exports.getProfileImage = async (req, res, next) => {
  try {
    const { filename } = req.params;
    
    // Validate filename to prevent directory traversal
    if (!filename || filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
      return res.status(400).json({ error: "Invalid filename" });
    }
    
    const imagePath = path.join(__dirname, '../../uploads/profile', filename);
    
    // Check if file exists
    if (!fs.existsSync(imagePath)) {
      return res.status(404).json({ error: "Image not found" });
    }
    
    // Read file and convert to base64
    const imageBuffer = fs.readFileSync(imagePath);
    const base64Image = imageBuffer.toString('base64');
    const mimeType = 'image/jpeg'; // You can determine this from file extension if needed
    
    // Return as data URL
    const dataUrl = `data:${mimeType};base64,${base64Image}`;
    
    res.json({ imageUrl: dataUrl });
  } catch (err) {
    console.error("Get profile image error:", err);
    if (!res.headersSent) {
      res.status(500).json({ error: "Internal server error" });
    }
  }
};

exports.deleteProfilePicture = async (req, res, next) => {
  try {
    console.log("=== DELETE PROFILE PICTURE DEBUG ===");
    console.log("User ID:", req.user?.id);
    
    const userId = req.user.id;
    
    // Get current user to check if they have a profile picture
    console.log("Fetching current user...");
    const currentUser = await AdminService.getUserById(userId);
    console.log("Current user:", currentUser);
    
    if (!currentUser) {
      console.log("User not found");
      return res.status(404).json({ error: "User not found" });
    }
    
    console.log("Current profile picture path:", currentUser.profilePicturePath);
    
    // Delete the profile picture file (local or Cloudinary)
    if (currentUser.profilePicturePath) {
      if (currentUser.profilePicturePath.startsWith('/uploads/profile/')) {
        // Local file deletion
        console.log("Deleting local profile picture...");
        const filename = currentUser.profilePicturePath.split('/').pop();
        console.log("Filename:", filename);
        const imagePath = path.join(__dirname, '../../uploads/profile', filename);
        console.log("Image path:", imagePath);
        
        if (fs.existsSync(imagePath)) {
          console.log("File exists, deleting...");
          fs.unlinkSync(imagePath);
          console.log("File deleted successfully");
        } else {
          console.log("File does not exist");
        }
      } else if (currentUser.profilePicturePath.startsWith('http')) {
        // Cloudinary URL - for now just log, could implement Cloudinary API deletion if needed
        console.log("Cloudinary profile picture detected:", currentUser.profilePicturePath);
        console.log("Note: Cloudinary images are not automatically deleted from cloud storage");
      } else {
        console.log("Unknown profile picture format:", currentUser.profilePicturePath);
      }
    } else {
      console.log("No profile picture to delete");
    }
    
    // Update user to remove profile picture path
    console.log("Updating user profile picture path to null...");
    const updatedUser = await AdminService.updateUserById(userId, {
      profilePicturePath: null
    });
    console.log("Updated user:", updatedUser);
    
    console.log("=== END DEBUG ===");
    
    res.status(200).json({
      message: "ลบรูปโปรไฟล์เรียบร้อยแล้ว",
      user: updatedUser
    });
  } catch (err) {
    console.error("Delete profile picture error:", err);
    console.error("Error stack:", err.stack);
    next(err);
  }
};

exports.getGoogleProfilePicture = async (req, res, next) => {
  try {
    const userId = req.user.id;
    
    // Get Google account for this user
    const googleAccount = await prisma.account.findFirst({
      where: { 
        userId: userId,
        provider: 'google'
      },
      select: { profilePictureUrl: true }
    });
    
    res.status(200).json({
      googleProfilePicture: googleAccount?.profilePictureUrl || null
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

    const requesterIsSuperAdmin = (req.user.roles || []).includes("SUPER_ADMIN");

    // เฉพาะ SUPER_ADMIN เท่านั้นที่เพิ่ม/ลบ role SUPER_ADMIN ได้
    if (userRole.includes("SUPER_ADMIN") && !requesterIsSuperAdmin) {
      throw createError(403, "ต้องใช้สิทธิ์ SUPER_ADMIN ในการเพิ่มหรือลบบทบาท SUPER_ADMIN");
    }

    // กันไม่ให้ถอดบทบาท SUPER_ADMIN ของตัวเอง (กันล็อกเอาต์ตัวเอง)
    if (action === "REMOVE" && req.user.id === userId && userRole.includes("SUPER_ADMIN")) {
      throw createError(403, "ไม่สามารถถอดบทบาท SUPER_ADMIN ของตัวเองได้");
    }

    // ป้องกัน ADMIN แก้ role ของ user ที่เป็น SUPER_ADMIN
    const targetUser = await UserService.getUserByIdWithRoles(userId);
    const targetRoleNames = (targetUser?.userRoles || []).map((ur) => ur.role?.name).filter(Boolean);

    if (targetRoleNames.includes("SUPER_ADMIN") && !requesterIsSuperAdmin) {
      throw createError(403, "ไม่สามารถแก้ไขบทบาทของผู้ใช้ที่มีสิทธิ์ SUPER_ADMIN ได้");
    }

    const roles = await UserService.getRolesByNames(userRole);

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

    //email — แจ้งผู้ใช้เมื่อบทบาทเปลี่ยน (ใช้ template แบรนด์ของคณะ)
    const user = await UserService.getUserByIdWithRoles(userId);

    if (user?.email) {
      try {
        await sendNotification("ROLE_UPDATED", {
          to: user.email,
          userName: `${user.prefixName} ${user.firstName} ${user.lastName}`,
          roles: roles.map((role) => role.name).join(", "),
        });
      } catch (emailError) {
        console.error("Failed to send role-updated email:", emailError.message);
      }
    }

    res.status(200).json({ message: "อัปเดตบทบาทผู้ใช้", roles: updatedRole });
  } catch (err) {
    next(err);
  }
};

exports.updateUser = async (req, res, next) => {
  try {
    /* ---------- เตรียม id ---------- */
    const { id } = req.params;
    const who = req.user;
    const userId = id ? +id : who.id;

    if (!userId) return next(createError(400, "Invalid user ID"));

    /* ---------- รับค่า body ---------- */
    const {
      prefixName, firstName, lastName, sex, email, phone,
      position, hireDate, employmentType,
      personnelTypeId, departmentId,
    } = req.body;

    /* ---------- validate ---------- */
    validatePhone(phone);

    // ตรวจอีเมลซ้ำ (ถ้าเปลี่ยน)
    if (email) {
      const emailTaken = await prisma.user.findFirst({
        where: { email, NOT: { id: userId } },
        select: { id: true },
      });
      if (emailTaken) return next(createError(409, "อีเมลนี้ถูกใช้งานแล้ว"));
    }

    /* ---------- สร้าง updateData ---------- */
    const updateData = {
      prefixName,
      firstName,
      lastName,
      sex,
      email,
      phone,
      ...(hireDate && { hireDate: new Date(hireDate) }),
      ...(employmentType && { employmentType }),

      /* ---- position ----
         ถ้าคุณมี model Position แยก (lookupPositions) ให้ส่ง positionId
         จาก FE แทนข้อความ แล้วใช้ connect; ถ้าไม่ ก็บันทึกเป็น string ตรง ๆ */
      ...(position && typeof position === "string" && { position }),

      ...(personnelTypeId !== undefined && {
        personnelType:
          personnelTypeId
            ? { connect: { id: +personnelTypeId } }
            : { disconnect: true },          // เคลียร์ความสัมพันธ์ได้
      }),

      ...(departmentId !== undefined && {
        department:
          departmentId
            ? { connect: { id: +departmentId } }
            : { disconnect: true },          // เคลียร์ความสัมพันธ์ได้
      }),
    };

    /* ---------- อัปโหลดรูป ---------- */
    if (req.file) {
      const url = await cloudUpload(req.file.path);
      updateData.profilePicturePath = url;
    }

    /* ---------- อัปเดตฐานข้อมูล ---------- */
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: updateData,
      include: {
        department: { include: { organization: true } },
        personnelType: true,
        userRoles: { include: { role: true } },
      },
    });

    /* ---------- ออก JWT ใหม่ ---------- */
    const newToken = jwt.sign(
      { sub: updatedUser.id, role: updatedUser.role },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    /* ---------- ส่งกลับ ---------- */
    res.status(200).json({
      message: "อัปเดตผู้ใช้",
      user: updatedUser,
      token: newToken,
    });
  } catch (err) {
    next(err);
  }
};

exports.checkUserRole = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const userRole = await UserService.getUserByIdWithRoles(userId);

    if (!userRole) {
      console.log("Debug userRole ", userRole.role);
      throw createError(404, "User role not found");
    }
    console.log("Debug userRole ", userRole);

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

    if (req.user?.id) {
      await AuditLogService.createLog(
        req.user.id,
        "CREATE",
        "Organization",
        newOrganization.id,
        `สร้างองค์กร: ${name}`,
        req.ip,
        req.get('User-Agent')
      );
    }

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

    const oldOrganization = await OrgAndDeptService.getOrganizationById(id);
    if (!oldOrganization) {
      throw createError(404, "ไม่พบข้อมูลองค์กร");
    }

    const updatedOrganization = await OrgAndDeptService.updateOrganization(
      id,
      name
    );

    if (!updatedOrganization) {
      throw createError(404, "ไม่พบข้อมูลองค์กร");
    }

    if (req.user?.id) {
      await AuditLogService.createUpdateLog(
        req.user.id,
        "Organization",
        parseInt(id),
        oldOrganization,
        updatedOrganization,
        req.ip,
        req.get('User-Agent')
      );
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

    const oldOrganization = await OrgAndDeptService.getOrganizationById(id);
    if (!oldOrganization) {
      throw createError(404, "ไม่พบข้อมูลองค์กร");
    }

    // ตรวจสอบ relations ก่อนลบ
    const { departmentCount: deptCount, approverPositionCount: approverPosCount } =
      await OrgAndDeptService.countOrganizationRelations(parseInt(id));

    if (deptCount > 0) {
      throw createError(400,
        `ไม่สามารถลบองค์กร "${oldOrganization.name}" ได้ เนื่องจากมีแผนก/สาขา ${deptCount} แห่งที่อ้างอิงอยู่ ` +
        `กรุณาย้ายหรือลบแผนกที่เกี่ยวข้องก่อน`
      );
    }

    if (approverPosCount > 0) {
      throw createError(400,
        `ไม่สามารถลบองค์กร "${oldOrganization.name}" ได้ เนื่องจากมีตำแหน่งผู้อนุมัติ ${approverPosCount} ตำแหน่งที่อ้างอิงอยู่ ` +
        `กรุณาลบตำแหน่งผู้อนุมัติที่เกี่ยวข้องก่อน`
      );
    }

    const deletedOrganization = await OrgAndDeptService.deleteOrganization(id);

    if (!deletedOrganization) {
      throw createError(404, "ไม่พบข้อมูลองค์กร");
    }

    if (req.user?.id) {
      await AuditLogService.createLog(
        req.user.id,
        "DELETE",
        "Organization",
        parseInt(id),
        `ลบองค์กร: ${oldOrganization.name} (ID: ${id})`,
        req.ip,
        req.get('User-Agent'),
        oldOrganization
      );
    }

    res
      .status(200)
      .json({ message: "ลบองค์กรสำเร็จ", data: deletedOrganization });
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
    const numID = parseInt(id);

    const existing = await OrgAndDeptService.getDepartmentById(numID);
    if (!existing) {
      throw createError(404, "ไม่พบแผนกที่ต้องการลบ");
    }

    // ตรวจสอบ relations ก่อนลบ
    const userCount = await OrgAndDeptService.countUsersByDepartmentId(numID);

    if (userCount > 0) {
      throw createError(400,
        `ไม่สามารถลบแผนก "${existing.name}" ได้ เนื่องจากมีผู้ใช้งาน ${userCount} คนที่สังกัดอยู่ ` +
        `กรุณาย้ายผู้ใช้งานไปแผนกอื่นก่อนลบ`
      );
    }

    const deletedDepartment = await OrgAndDeptService.deleteDepartment(id);

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

    const personnelType = await OrgAndDeptService.createPersonnelType(name);

    res.status(201).json({
      message: "สร้างประเภทบุคคลากรสำเร็จ",
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
      name
    );

    if (!updatedPersonnelType) {
      throw createError(404, "Personnel type not found");
    }

    res.status(200).json({
      message: "อัปเดตประเภทบุคคลากรสำเร็จ",
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
      message: "ลบประเภทบุคคลากรสำเร็จ",
      data: deletedPersonnelType,
    });
  } catch (err) {
    next(err);
  }
};

exports.getAllApprover = async (req, res) => {
  try {
    const approvers = await UserService.getAllApprover();
    res.status(200).json({ success: true, data: approvers });
  } catch (err) {
    res.status(400).json({message: err.message});
  }
};

exports.getApproversForLevel = async (req, res) => {
  try {
    const { level } = req.params;
    const { date } = req.query;

    const approvers = await UserService.getApproversForLevel(parseInt(level), date || new Date());
    res.status(200).json({ success: true, data: approvers });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

exports.getAllUsersInDepartment = async (req, res) => {
  try {
    const { search } = req.query;

    console.log(req.user);
    
    const where = {
      departmentId: req.user.departmentId,
    };

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
              positionNumber: { contains: search },
            },
          },
        },
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
          orderBy: { effectiveFrom: "desc" },
          take: 1,
          select: {
            positionNumber: true,
            effectiveFrom: true,
          },
        },
      },
      orderBy: { firstName: "asc" },
    });

    const data = users.map((u) => ({
      id: u.id,
      fullName: `${u.prefixName || ""}${u.prefixName ? " " : ""}${u.firstName} ${u.lastName}`,
      email: u.email,
      prefixName: u.prefixName,
      firstName: u.firstName,
      lastName: u.lastName,
      department: u.department,
      positionNumbers: u.positionNumbers,
    }));

    return res.status(200).json({
      message: "ดึงข้อมูลผู้ใช้ในสาขาสำเร็จ",
      data,
    });
  } catch (error) {
    console.error("[getAllUsersInDepartment]", error);
    return res.status(500).json({ message: "Server error" });
  }
};
