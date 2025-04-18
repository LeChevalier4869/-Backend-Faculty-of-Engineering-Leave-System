const prisma = require("../config/prisma");
const createError = require("../utils/createError");
//reset pass
const JWT_SECRET = process.env.JWT_SECRET || "mysecret";
const RESET_TOKEN_EXPIRY = "10m";
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const nodemailer = require("nodemailer");

class UserService {
  static async createUser(data) {
    try {
      // อนุญาตให้สร้างผู้ใช้โดยไม่มี password ได้ (กรณีล็อกอินด้วย Google)
      if (data.isGoogleAccount && !data.password) {
        data.password = uuidv4(); // สร้างรหัสชั่วคราว (แต่ต้องไม่ให้ล็อกอินด้วยวิธีปกติ)
      }
      if (data.hireDate) {
        data.hireDate = new Date(data.hireDate);
      }

      // ตรวจสอบว่า departmentId และ organizationId มีอยู่จริง
      const departmentExists = await prisma.department.findUnique({
        where: { id: parseInt(data.departmentId) },
      });
      if (!departmentExists) {
        throw createError(
          400,
          "Invalid departmentId: ไม่มีภาควิชานี้อยู่ในระบบ"
        );
      }

      const newUser = await prisma.user.create({
        data,
      });
      return newUser;
    } catch (err) {
      if (err.code === "P2002") {
        throw createError(400, "Email or username already exists");
      }
      throw err;
    }
  }

  static async getUserInfoById(userId) {
    return await prisma.user.findUnique({
      where: { id: userId },
      include: {
        userRoles: {
          include: {
            role: true,
          },
        },
        personnelType: true,
        department: true,
        leaveBalances: true,
        leaveRequests: {
          include: {
            leaveRequestDetails: true,
          },
        },
      },
    });
  }
  static async getUserByIdWithRoles(id) {
    return await prisma.user.findUnique({
      where: { id },
      include: {
        userRoles: {
          include: {
            role: { 
              select: {
                name: true,
              }
             }
          },
        },
        department: {
          include: {
            organization: true,
          },
        },
        personnelType: true,
      }
    });
  }

  static async getUserByEmail(email) {
    return await prisma.user.findUnique({
      where: { email },
      include: {
        personnelType: true,
        department: {
          include: {
            organization: true,
          }
        }
      },
    });
  }
  static async getUserByRole(roleName) {
    return await prisma.user.findMany({
      where: {
        userRoles: {
          some: {
            role: {
              name: roleName
            }
          }
        }
      }
    });
  }
  static async deleteUserById(id) {
    return await prisma.user.delete({
      where: { id },
    });
  }
  static async updateUser(userEmail, data) {
    try {
      const userExists = await prisma.user.findUnique({
        where: { email: userEmail },
      });
      if (!userExists) {
        createError(404, "User not found");
      }

      const updatedUser = await prisma.user.update({
        where: { email: userEmail },
        data,
      });

      return updatedUser;
    } catch {
      createError(400, "Failed to update");
    }
  }
  //update
  static async updateUserById(userId, data) {
    try {
      const user = await prisma.user.findUnique({
        where: { id: userId },
      });

      if (!user) {
        throw createError(404, "User not found");
      }

      const updatedUser = await prisma.user.update({
        where: { id: userId },
        data: {
          ...data,
          profilePicturePath: data.profilePicturePath,
        },
      });

      return updatedUser;
    } catch (err) {
      if (err.code === "P2002") {
        // ข้อผิดพลาด duplicate key (เช่น email ซ้ำ)
        throw createError(400, "Email or username already exists");
      }
      throw err;
    }
  }
  static async updateUserStatusById(userId, status) {
    try {
      const user = await prisma.user.findUnique({
        where: { id: userId },
      });

      if (!user) {
        throw createError(404, "User not found");
      }

      const updateUserStatus = await prisma.user.update({
        where: { id: userId },
        data: { inActive: status },
      });

      return updateUserStatus;
    } catch (err) {
      throw err;
    }
  }
  static async getUserLanding() {
    try {
      const user = await prisma.user.findMany({
        include: {
          personnelType: true,
          userRoles: {
            include: {
              role: true,
            },
          },
          department: {
            include: {
              organization: true,
            }
          }
        },
      });

      return user.map(({ password, ...rest }) => rest);
    } catch (err) {
      console.error("Error in getUserLanding", err);
      throw new Error("Error while fetching user data");
    }
  }
  static async updateUserRole(userId, roleIds) {
    try {
      await prisma.user_Role.deleteMany({
        where: { userId },
      });
      const userRoles = roleIds.map((roleId) => ({
        userId,
        roleId,
      }));
      return await prisma.user_Role.createMany({
        data: userRoles,
      });
    } catch (err) {
      throw new Error("Failed to update user roles");
    }
  }
  static async getRolesByNames(roleNames) {
    return await prisma.role.findMany({
      where: { name: { in: roleNames } },
    });
  }

  static async createUserProfile(userId, imgUrl) {
    return await prisma.user.update({
      where: {
        id: userId,
      },
      data: {
        profilePicturePath: imgUrl,
      },
    });
  }

  static async assignRolesToUser(userId, roleIds) {
    const userRoles = roleIds.map((roleId) => ({
      userId,
      roleId,
    }));
    return await prisma.user_Role.createMany({
      data: userRoles,
    });
  }
  static async getDepartment(userId) {
    const departments = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        department: {
          select: {
            id: true,
            name: true,
            headId: true,
            organizationId: true,
          },
        },
      },
    });
    return departments ? departments.department : null;
  }
  // static async getOrganization(userId) {
  //   const organizations = await prisma.user.findUnique({
  //     where: { id: userId },
  //     select: {
  //       organization: {
  //         select: {
  //           id: true,
  //           name: true,
  //         },
  //       },
  //     },
  //   });
  //   return organizations ? organizations.organization : null;
  // }
  static async getOrganization(userId) {
    const organizations = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        department: {  // เรียก `department` ก่อน
          select: {
            organization: {  // จากนั้นเลือก `organization` ของแผนกนั้น
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
    });
    return organizations ? organizations.department?.organization : null;
  }

  static async getPersonnelType(userId) {
    const personnelType = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        personnelType: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });
    return personnelType ? personnelType.personnelType : null;
  }
  static async getVerifier() {
    const user = await prisma.user.findFirst({
      where: {
        userRoles: {
          some: {
            role: {
              name: "VERIFIER",
            },
          },
        },
      },
      // orderBy: { createdAt: "desc" },
      include: { userRoles: { include: { role: true } } },
    });

    if (!user) throw createError(404, "ไม่พบผู้ตรวจสอบ (Verifier");

    return user;
  }
  static async getReceiver() {
    const user = await prisma.user.findFirst({
      where: {
        userRoles: {
          some: {
            role: {
              name: "RECEIVER",
            },
          },
        },
      },
      // orderBy: { createdAt: "desc" },
      include: { userRoles: { include: { role: true } } },
    });

    if (!user) throw createError(404, "ไม่พบผู้รับหนังสือ (Receiver)");

    return user;
  }
  static async getHeadOfDepartment(departmentId) {
    if (!departmentId || isNaN(departmentId)) {
      console.error("Invalid departmentId:", departmentId);
      throw createError(400, "Invalid department ID");
    }
    departmentId = Number(departmentId);
    console.log("Debug department id: ", departmentId);

    const department = await prisma.department.findUnique({
      where: { id: departmentId },
      select: { isHeadId: true },
    });

    if (!department) {
      throw createError(404, "Department not found");
    }

    // const headId = await prisma.users.findFirst({
    //   where: {
    //     id: userId,
    //   },
    //   select: {
    //     departments: {
    //       select: {
    //         isHeadId: true,
    //       }
    //     }
    //   },
    // });

    //validation headId

    // const headPerson = await this.getUserByIdWithRoles(headId);

    // //validation headPerson

    // return headPerson ? headPerson.departments.isHeadId : null;
    return department.headId;
  }
  static async addUserRoles(userId, roleIds) {
    const existingRoles = await prisma.user_Role.findMany({
      where: { userId },
      select: { roleId: true },
    });

    const existingRoleIds = existingRoles.map((role) => role.roleId);
    const newRoles = roleIds.filter((roleId) => !existingRoleIds.includes(roleId));

    if (newRoles.length === 0) return existingRoles;

    await prisma.user_Role.createMany({
      data: newRoles.map((roleId) => ({ userId, roleId })),
    });

    return await prisma.user_Role.findMany({
      where: { userId },
      include: { roles: true },
    });
  }
  static async removeUserRoles(userId, roleIds) {
    await prisma.user_Role.deleteMany({
      where: {
        userId,
        roleId: { in: roleIds },
      },
    });

    return await prisma.user_Role.findMany({
      where: { userId },
      include: { roles: true },
    });
  }
  static async getUserRoles(userId) {
    const roles = await prisma.user_Role.findMany({
      where: { userId },
      include: { roles: true },
    });

    return roles.map((role) => role.roles.name);
  }

  //------reset pass

  //ใช้เมื่อผู้ใช้ ล็อกอินอยู่แล้ว และต้องการเปลี่ยนรหัสผ่านของตัวเอง
  static async changePassword({ email, oldPassword, newPassword }) {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) throw new Error("ไม่พบผู้ใช้");

    const isMatch = await bcrypt.compare(oldPassword, user.password);
    if (!isMatch) throw new Error("รหัสผ่านเดิมไม่ถูกต้อง");

    const hashed = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({
      where: { id: user.id },
      data: { password: hashed },
    });

    return "เปลี่ยนรหัสผ่านสำเร็จ";
  }

  //ใช้เมื่อผู้ใช้ ลืมรหัสผ่านและยังไม่ได้ล็อกอิน
  static async forgotPassword(email) {
    if (!email) throw new Error("กรุณาระบุอีเมล");

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) throw new Error("ไม่พบผู้ใช้");

    const token = jwt.sign({ userId: user.id }, JWT_SECRET, {
      expiresIn: RESET_TOKEN_EXPIRY || "1h",
    });

    const resetUrl = `http://localhost:8000/reset-password?token=${token}`;

    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.EMAIL_USER_RMUTI2,
        pass: process.env.EMAIL_APP_PASS2, // 🟡 ต้องเป็น App Password เท่านั้น
      },
    });

    await transporter.sendMail({
      from: `"ระบบลาคณะวิศวกรรมศาสตร์" <${process.env.EMAIL_USER_RMUTI2}>`,
      to: email,
      subject: "ลิงก์รีเซ็ตรหัสผ่าน",
      html: `
        <p>คุณได้รับคำขอรีเซ็ตรหัสผ่าน</p>
        <p>คลิกที่ลิงก์ด้านล่างเพื่อรีเซ็ตรหัสผ่านของคุณ:</p>
        <a href="${resetUrl}">${resetUrl}</a>
        <p>หากคุณไม่ได้ร้องขอ สามารถละเว้นอีเมลนี้ได้</p>
      `,
    });

    return "ส่งอีเมลรีเซ็ตรหัสผ่านแล้ว";
  }

  //ใช้เมื่อผู้ใช้ ได้รับลิงก์รีเซ็ตรหัสผ่าน จาก forgot-password แล้วคลิกเข้ามาในหน้า reset
  static async resetPassword({ token, newPassword }) {
    try {
      const payload = jwt.verify(token, JWT_SECRET);
      const hashed = await bcrypt.hash(newPassword, 10);

      await prisma.user.update({
        where: { id: payload.userId },
        data: { password: hashed },
      });

      return "รีเซ็ตรหัสผ่านสำเร็จ";
    } catch (err) {
      throw new Error("โทเคนไม่ถูกต้องหรือหมดอายุ");
    }
  }
}

module.exports = UserService;

