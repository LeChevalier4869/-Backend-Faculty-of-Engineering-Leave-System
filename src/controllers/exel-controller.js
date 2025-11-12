const xlsx = require("xlsx");
const prisma = require("../config/prisma");
const UserService = require("../services/user-service");

exports.uploadUserExcel = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    // อ่านไฟล์ Excel
    const workbook = xlsx.read(req.file.buffer, { type: "buffer" });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const users = xlsx.utils.sheet_to_json(sheet);

    const createdUsers = [];
    const failedUsers = [];

    for (let index = 0; index < users.length; index++) {
      const user = users[index];
      const {
        prefixName,
        firstName,
        lastName,
        sex,
        email,
        phone,
        position,
        hireDate,
        employmentType,
        departmentName,
        personnelTypeName,
        role,
      } = user;

      const normalizedEmail = email?.trim().toLowerCase();

      try {
        // validate required fields
        if (
          !prefixName ||
          !firstName ||
          !lastName ||
          !sex ||
          !normalizedEmail ||
          !position ||
          !phone ||
          !hireDate ||
          !departmentName ||
          !personnelTypeName
        ) {
          throw {
            email: normalizedEmail || `Row ${index + 2}`,
            reason: "มี field required ว่างหรือไม่ถูกต้อง",
            rowData: user,
          };
        }

        // map employmentType
        let mappedEmploymentType = null;
        if (employmentType === "สายสนับสนุน" || employmentType === "SUPPORT") {
          mappedEmploymentType = "SUPPORT";
        } else if (
          employmentType === "สายวิชาการ" ||
          employmentType === "ACADEMIC"
        ) {
          mappedEmploymentType = "ACADEMIC";
        }

        // เช็ค domain email
        if (!/@(rmuti\.ac\.th|gmail\.com)$/.test(normalizedEmail)) {
          throw {
            email: normalizedEmail,
            reason: "โดเมนอีเมลล์ไม่ถูกต้อง",
            rowData: user,
          };
        }

        // เช็คซ้ำ
        const existingUser = await prisma.user.findUnique({
          where: { email: normalizedEmail },
        });
        if (existingUser) {
          throw {
            email: normalizedEmail,
            reason: "มีอีเมลล์นี้อยู่ในระบบแล้ว",
            rowData: user,
          };
        }

        // หา department และ personnelType
        const personnelType = await prisma.personnelType.findFirst({
          where: { name: personnelTypeName },
        });
        // console.log("Debug personnelType:", personnelType.id);
        if (!personnelType) {
          throw {
            email: normalizedEmail,
            reason: "ประเภทบุคคลไม่ถูกต้อง",
            rowData: user,
          };
        }

        const department = await prisma.department.findFirst({
          where: { name: departmentName },
        });
        // console.log("Debug department:", department.id);
        if (!department) {
          throw {
            email: normalizedEmail,
            reason: "สาขาไม่ถูกต้อง",
            rowData: user,
          };
        }

        // แปลง hireDate รองรับหลาย format
        let parsedDate = null;

        if (typeof hireDate === "string") {
          const parts = hireDate.includes("/")
            ? hireDate.split("/").map(Number)
            : hireDate.split("-").map(Number);

          if (parts.length === 3) {
            if (hireDate.includes("/")) {
              parsedDate = new Date(parts[2], parts[1] - 1, parts[0]);
            } else {
              parsedDate = new Date(parts[0], parts[1] - 1, parts[2]);
            }
          }
        } else if (hireDate instanceof Date) {
          parsedDate = hireDate;
        } else if (typeof hireDate === "number") {
          parsedDate = new Date((hireDate - 25569) * 86400 * 1000);
        }

        if (!parsedDate || isNaN(parsedDate.getTime())) {
          console.log(`Row ${index + 2} invalid hireDate:`, hireDate);
          throw {
            email: normalizedEmail,
            reason: "hireDate ไม่ถูกต้อง",
            rowData: user,
          };
        }

        // console.log("Creating user:", {
        //   prefixName,
        //   firstName,
        //   lastName,
        //   sex,
        //   email: normalizedEmail,
        //   hireDate: parsedDate,
        //   departmentId: department?.id,
        //   personnelTypeId: personnelType?.id,
        // });

        // Insert user
        const created = await prisma.user.create({
          data: {
            prefixName,
            firstName,
            lastName,
            sex,
            email: normalizedEmail,
            phone,
            position,
            hireDate: parsedDate,
            employmentType: mappedEmploymentType,
            departmentId: department.id,
            personnelTypeId: personnelType.id,
          },
        });

        // กำหนด role ให้กับผู้ใช้
        let roleList = ["USER"];
        if (role) {
          if (Array.isArray(role)) {
            roleList = [...roleList, ...role];
          } else {
            roleList.push(role);
          }
        }
        roleList = [...new Set(roleList)];
        const roles = await UserService.getRolesByNames(roleList);
        if (!roles || roles.length !== roleList.length) {
          console.log("Debug roles: ", roleList);
          throw createError(400, "Invalid roles provided");
        }
        await UserService.assignRolesToUser(
          created.id,
          roles.map((role) => role.id)
        );

        // กำหนด Rank ตาม personnelType
        await UserService.assignRankToUser(
          created.id,
          personnelType.id,
          parsedDate
        );

        // gen balance ของ ลาป่วย ลากิจ ลาพัก ตาม rank ที่ได้
        await UserService.assignLeaveBalanceFromRanks(created.id);

        console.log(`✅ Created user: ${created.id} ${created.email}`);
        createdUsers.push(created);
      } catch (err) {
        console.error(`Error processing row ${index + 2}:`, err);
        failedUsers.push(err);
        continue; // ข้าม row ที่ error และสร้าง user ต่อไป
      }
    }

    res.json({
      message: "Users processed",
      createdCount: createdUsers.length,
      failedCount: failedUsers.length,
      createdUsers,
      failedUsers, // rowData จะช่วย debug Excel ได้ง่ายขึ้น
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Something went wrong" });
  }
};

// exports.login = async (req, res, next) => {
//   try {
//     const { email, password } = req.body;

//     if (!email || !password)
//       throw createError(400, "กรุณากรอกอีเมลหรือชื่อผู้ใช้และรหัสผ่าน");

//     // user may use email or username
//     // if (!isCorporateEmail(email)) {
//     //   return createError(403, "อนุญาตให้ล็อกอินด้วยอีเมลมหาวิทยาลัยเท่านั้น");
//     // }

//     // check email or username
//     const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

//     let user;
//     if (isEmail) {
//       user = await UserService.getUserByEmail(email);
//     } else {
//       // ถ้าไม่ใช่อีเมล ให้ค้นหาจากชื่อผู้ใช้
//       const users = await UserService.getUserByUsername(email);
//       user = users.find((u) => u.email.split("@")[0] === email) || null;
//     }

//     if (!user) {
//       return createError(404, "ไม่พบผู้ใช้ในระบบ");
//     }

//     // จำเป็นต้องนำเข้าฐานข้อมูลก่อน แล้วรหัสจะทำยังไง?
//     const isMatch = await bcrypt.compare(password, user.password);
//     if (!isMatch) {
//       return createError(401, "รหัสผ่านไม่ถูกต้อง");
//     }
//     // console.log('isMatch = ' + isMatch);
//     // console.log('password = ' + password);
//     // console.log('user pass = ' + user.password);

//     const userWithRoles = await UserService.getUserByIdWithRoles(user.id);
//     const roles = userWithRoles.userRoles.map((userRole) => userRole.role.name);

//     const departments = await UserService.getDepartment(user.id);
//     const organization = await UserService.getOrganization(user.id);
//     const personnelType = await UserService.getPersonnelType(user.id);

//     // console.log("Debug department: ", departments);
//     // console.log("Debug organization: ", organization);
//     // console.log("Debug personnelType: ", personnelType);

//     const token = jwt.sign(
//       {
//         id: user.id,
//         email: user.email,
//         prefixName: user.prefixName,
//         firstName: user.firstName,
//         lastName: user.lastName,
//         sex: user.sex,
//         role: roles,
//         phone: user.phone,
//         organization: organization,
//         department: departments,
//         // isHeadOfDepartment: ตรวจสอบว่า user เป็นหัวหน้าของสาขานี้หรือไม่,
//         personnelType: personnelType,
//         hireDate: user.hireDate,
//         employmentType: user.employmentType,
//         profilePicturePath: user.profilePicturePath,
//       },
//       process.env.JWT_SECRET,
//       { expiresIn: process.env.JWT_EXPIRESIN }
//     );
//     res.status(200).json({ token });
//   } catch (err) {
//     next(err);
//   }
// };
