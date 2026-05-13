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
        LeaveRequest: {
          include: {
            leaveRequestDetails: true,
          },
        },
        positionNumbers: {
          where: { isCurrent: true },
          select: {
            positionNumber: true,
            effectiveFrom: true,
          },
        },
        accounts: {
          select: {
            provider: true,
            profilePictureUrl: true,
          },
        },
      },
    });
  }

  static async getUserByIdWithRoles(id) {
    const user = await prisma.user.findUnique({
      where: { id },
      include: {
        userRoles: {
          include: {
            role: {
              select: {
                name: true,
              },
            },
          },
        },
        department: {
          include: {
            organization: true,
          },
        },
        personnelType: true,
        positionNumbers: {
          where: { isCurrent: true },
          select: {
            positionNumber: true,
            effectiveFrom: true,
          },
        },
      },
    });

    return user;
  }

  static async getUserByEmail(email) {
    const user = await prisma.user.findUnique({
      where: { email },
      include: {
        personnelType: true,
        department: {
          include: {
            organization: true,
          },
        },
        positionNumbers: {
          where: { isCurrent: true },
          select: {
            positionNumber: true,
            effectiveFrom: true,
          },
        },
      },
    });

    console.log("User found:", user);
    return user;
  }

  static async getUserByUsername(email) {
     return await prisma.user.findMany({
      where: {
        email: {
          startsWith: email + "@",
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
              name: roleName,
            },
          },
        },
      },
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
        throw createError(404, "User not found");
      }

      const updatedUser = await prisma.user.update({
        where: { email: userEmail },
        data,
      });

      return updatedUser;
    } catch (error) {
      console.error(error);
      throw createError(400, "Failed to update");
    }
  }

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

  static async getUserForLogin() {
    const user = await prisma.user.findFirst({ where: {} });

    if (!user) {
      throw createError(404, "ไม่พบผู้ใช้");
    }
    return user;
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
            },
          },
          positionNumbers: {
            where: { isCurrent: true },
            select: {
              positionNumber: true,
              effectiveFrom: true,
            },
          },
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
      await prisma.userRole.deleteMany({
        where: { userId },
      });
      const userRoles = roleIds.map((roleId) => ({
        userId,
        roleId,
      }));
      return await prisma.userRole.createMany({
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
    return await prisma.userRole.createMany({
      data: userRoles,
    });
  }

  static async deleteUserRole(userId, roleId) {
    return await prisma.userRole.deleteMany({
      where: {
        userId,
        roleId,
      },
    });
  }

  static async getHeadIdByDepartmentId(departmentId) {
    return await prisma.department.findUnique({
      where: { id: departmentId },
      select: { headId: true },
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

  static async getOrganization(userId) {
    const organizations = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        department: {
          select: {
            organization: {
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
      include: { userRoles: { include: { role: true } } },
    });

    if (!user) throw createError(404, "ไม่พบผู้ตรวจสอบ (Verifier)");

    return user;
  }

  static async getApproversForLevel(level, date) {
    try {
      // แปลง level เป็น role name
      const roleMap = {
        1: 'APPROVER_1',
        2: 'VERIFIER',
        3: 'APPROVER_2',
        4: 'APPROVER_3',
        5: 'APPROVER_4'
      };
      const roleName = roleMap[level];
      if (!roleName) {
        throw createError(400, `Invalid approver level: ${level}`);
      }

      // 1. ดึง users ที่มี role นั้น (original approvers)
      const originalApprovers = await prisma.user.findMany({
        where: {
          userRoles: {
            some: {
              role: {
                name: roleName
              }
            }
          }
        },
        include: {
          userRoles: {
            include: {
              role: true
            }
          }
        }
      });

      // 1.5. ดึง proxy users ที่เป็น proxy ใน role นั้น (แม้ไม่มี role นั้น)
      const proxyUsersForRole = await prisma.user.findMany({
        where: {
          proxyApprovals: {
            some: {
              approverLevel: level,
              status: 'ACTIVE'
            }
          }
        },
        include: {
          userRoles: {
            include: {
              role: true
            }
          }
        }
      });

      // รวม users ทั้งสองกลุ่ม และลบตัวซ้ำ
      const allUsers = [...originalApprovers, ...proxyUsersForRole];
      const uniqueUsers = allUsers.filter((user, index, self) =>
        index === self.findIndex(u => u.id === user.id)
      );

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      // แปลงเป็น UTC midnight ให้ตรงกับข้อมูลในฐานข้อมูล
      const utcToday = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()));

      const proxies = await prisma.proxyApproval.findMany({
        where: {
          approverLevel: level,
          status: 'ACTIVE',
          OR: [
            // กรณีรายวัน
            {
              isDaily: true,
              dailyDate: utcToday
            },
            // กรณีช่วงเวลา
            {
              isDaily: false,
              startDate: { lte: utcToday },
              endDate: { gte: utcToday }
            }
          ]
        },
        include: {
          originalApprover: {
            select: {
              id: true,
              prefixName: true,
              firstName: true,
              lastName: true,
              email: true,
              userRoles: {
                include: {
                  role: true
                }
              }
            }
          },
          proxyApprover: {
            select: {
              id: true,
              prefixName: true,
              firstName: true,
              lastName: true,
              email: true,
              userRoles: {
                include: {
                  role: true
                }
              }
            }
          }
        }
      });

      // 3. รวม proxy users
      const proxyUserIds = proxies.map(p => p.proxyApproverId);
      const proxyUsers = await prisma.user.findMany({
        where: {
          id: { in: proxyUserIds }
        },
        include: {
          userRoles: {
            include: {
              role: true
            }
          }
        }
      });

      // 5. เพิ่มข้อมูลว่าเป็น original หรือ proxy
      const usersWithProxyInfo = uniqueUsers.map(user => {
        const proxyInfo = proxies.find(p => p.proxyApproverId === user.id);
        const originalInfo = proxies.find(p => p.originalApproverId === user.id);

        // Validate: ถ้า user มี role นี้อยู่แล้ว ไม่ต้องแสดงเป็น proxy
        const hasOriginalRole = user.userRoles.some(ur => ur.role.name === roleName);

        return {
          ...user,
          isProxy: !!proxyInfo, // แสดงเป็น proxy ถ้ามี proxyInfo (ไม่สนว่ามี role อยู่แล้วหรือไม่)
          isOriginal: !!originalInfo,
          proxyInfo: proxyInfo ? {
            originalApprover: proxyInfo.originalApprover,
            approverLevel: proxyInfo.approverLevel,
            reason: proxyInfo.reason
          } : null
        };
      });

      return usersWithProxyInfo;
    } catch (error) {
      console.error('Error getting approvers for level:', error);
      throw createError(500, 'ไม่สามารถดึงข้อมูลผู้อนุมัติได้');
    }
  }

  static async getHeadOfDepartment(departmentId) {
    if (!departmentId || isNaN(departmentId)) {
      console.error("Invalid departmentId:", departmentId);
      throw createError(400, "Invalid department ID");
    }
    departmentId = Number(departmentId);
    // console.log("Debug department id: ", departmentId);

    const department = await prisma.department.findUnique({
      where: { id: departmentId },
      select: { headId: true },
    });

    if (!department) {
      throw createError(404, "Department not found");
    }

    return department.headId;
  }

  static async getApprover2() {
    const user = await prisma.user.findFirst({
      where: {
        userRoles: {
          some: {
            role: {
              name: "APPROVER_2",
            },
          },
        },
      },
      include: { userRoles: { include: { role: true } } },
    });
    if (!user) throw createError(404, "ไม่พบผู้อนุมัติ (Approver 2)");
    return user;
  }

  static async getApprover3() {
    const user = await prisma.user.findFirst({
      where: {
        userRoles: {
          some: {
            role: {
              name: "APPROVER_3",
            },
          },
        },
      },
      include: { userRoles: { include: { role: true } } },
    });
    if (!user) throw createError(404, "ไม่พบผู้อนุมัติ (Approver 3)");
    return user;
  }

  static async getApprover4() {
    const user = await prisma.user.findFirst({
      where: {
        userRoles: {
          some: {
            role: {
              name: "APPROVER_4",
            },
          },
        },
      },
      include: { userRoles: { include: { role: true } } },
    });
    if (!user) throw createError(404, "ไม่พบผู้อนุมัติ (Approver 4)");
    return user;
  }

  static async addUserRoles(userId, roleIds) {
    const existingRoles = await prisma.userRole.findMany({
      where: { userId },
      select: { roleId: true },
    });

    const existingRoleIds = existingRoles.map((role) => role.roleId);
    const newRoles = roleIds.filter(
      (roleId) => !existingRoleIds.includes(roleId)
    );

    if (newRoles.length === 0) return existingRoles;

    await prisma.userRole.createMany({
      data: newRoles.map((roleId) => ({ userId, roleId })),
    });

    return await prisma.userRole.findMany({
      where: { userId },
      include: { role: true },
    });
  }

  static async removeUserRoles(userId, roleIds) {
    await prisma.userRole.deleteMany({
      where: {
        userId,
        roleId: { in: roleIds },
      },
    });

    return await prisma.userRole.findMany({
      where: { userId },
      include: { role: true },
    });
  }

  static async getUserRoles(userId) {
    const roles = await prisma.userRole.findMany({
      where: { userId },
      include: { role: true },
    });

    return roles.map((r) => r.role?.name).filter(Boolean);
  }

  static async changePassword({ email, oldPassword, newPassword }) {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) throw new Error("ไม่พบผู้ใช้");

    const isMatch = await bcrypt.compare(oldPassword, user.password);
    if (!isMatch) throw new Error("รหัสผ่านปัจจุบันไม่ถูกต้อง");
    if (oldPassword === newPassword)
      throw new Error("รหัสผ่านใหม่ต้องไม่ซ้ำกับรหัสผ่านปัจจุบัน");

    const letterCount = (newPassword.match(/[a-zA-Z]/g) || []).length;
    if (String(newPassword).length < 8 || letterCount < 4) {
      throw createError(
        400,
        "รหัสผ่านต้องมีความยาวมากกว่า 8 ตัวอักษร และต้องมีตัวอักษรอย่างน้อย 4 ตัว"
      );
    }
    const hashed = await bcrypt.hash(newPassword, 10);
    await prisma.User.update({
      where: { id: user.id },
      data: { password: hashed },
    });

    return "เปลี่ยนรหัสผ่านสำเร็จ";
  }

  static async forgotPassword(email) {
    if (!email) throw new Error("กรุณาระบุอีเมล");

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) throw new Error("ไม่พบผู้ใช้");

    const token = jwt.sign({ userId: user.id }, JWT_SECRET, {
      expiresIn: RESET_TOKEN_EXPIRY || "5m",
    });

    const resetUrl = `https://frontend-faculty-of-engine-git-c919d8-lechevalier4869s-projects.vercel.app/reset-password?token=${token}`;

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
            <p style="color:red;"><strong>ลิงก์นี้จะหมดอายุใน 5 นาที</strong></p>
            <p>หากคุณไม่ได้ร้องขอ สามารถละเว้นอีเมลนี้ได้</p>
      `,
    });

    return "ส่งอีเมลรีเซ็ตรหัสผ่านแล้ว";
  }

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

  static async assignRankToUser(userId, personnelTypeId, hireDate) {
    if (!hireDate) return;

    const currentDate = new Date();
    const hireMonths =
      (currentDate.getFullYear() - hireDate.getFullYear()) * 12 +
      (currentDate.getMonth() - hireDate.getMonth());

    const allRanks = await prisma.rank.findMany({
      where: {
        personnelTypeId: parseInt(personnelTypeId),
      },
    });

    for (const rank of allRanks) {
      const { id: rankId, minHireMonths, maxHireMonths, leaveTypeId } = rank;

      // ตรวจสอบว่าเข้าเงื่อนไขหรือไม่
      const minPass = minHireMonths === null || hireMonths >= minHireMonths;
      const maxPass = maxHireMonths === null || hireMonths <= maxHireMonths;

      // เงื่อนไขต้องผ่านทั้งคู่ และต้องมี leaveTypeId
      if (minPass && maxPass && leaveTypeId !== null) {
        await prisma.userRank.create({
          data: {
            userId,
            rankId,
          },
        });
      }
    }
  }

  static async assignLeaveBalanceFromRanks(userId) {
    const fiscalYearSetting = await prisma.setting.findUnique({
    where: { key: "fiscalYear" },
  });
  const yearValue = parseInt(fiscalYearSetting.value, 10);

    const userRanks = await prisma.userRank.findMany({
      where: { userId },
      include: {
        rank: true,
      },
    });

    for (const userRank of userRanks) {
      const { leaveTypeId, maxDays, receiveDays, isBalance } = userRank.rank;

      // ข้ามถ้าไม่มี leaveTypeId หรือ maxDays
      if (!leaveTypeId || maxDays === null) continue;

      // สำหรับประเภทการลาที่ไม่ต้องหักวัน (receiveDays = 0 && isBalance = 1)
      // ให้ตั้งค่าเป็น 0 เพื่อบอกว่าไม่ต้องตรวจสอบยอดคงเหลือ
      const balanceData = {
        userId,
        leaveTypeId,
        maxDays: (receiveDays === 0 && isBalance === 1) ? 0 : maxDays,
        usedDays: (receiveDays === 0 && isBalance === 1) ? 0 : 0,
        pendingDays: (receiveDays === 0 && isBalance === 1) ? 0 : 0,
        remainingDays: (receiveDays === 0 && isBalance === 1) ? 0 : receiveDays,
        year: yearValue,
      };

      await prisma.leaveBalance.create({
        data: balanceData,
      });
      // console.log(`➕ เพิ่ม LeaveBalance ให้ userId ${userId}, leaveType ${leaveTypeId}`);
    }
  }

  static async assignLeaveBalanceFromRanksForReset(userId, carryOverDays) {
    const fiscalYearSetting = await prisma.setting.findUnique({
      where: { key: "fiscalYear" },
    });
    const yearValue = parseInt(fiscalYearSetting.value, 10);

    const userRanks = await prisma.userRank.findMany({
      where: { userId },
      include: {
        rank: true,
      },
    });

    for (const userRank of userRanks) {
      const { leaveTypeId, maxDays, receiveDays, isBalance } = userRank.rank;

      // ข้ามถ้าไม่มี leaveTypeId หรือ maxDays
      if (!leaveTypeId || maxDays === null) continue;

      // สำหรับประเภทการลาที่ไม่ต้องหักวัน (receiveDays = 0 && isBalance = 1)
      // และเป็นลาพักผ่อน (leaveTypeId = 4) ให้ทำ carry over
      let newRemainingDays;
      if (receiveDays === 0 && isBalance === 1) {
        // ไม่ต้องหักวัน ไม่ต้องคำนวณ carry over
        newRemainingDays = 0;
      } else if (Number(leaveTypeId) === 4) {
        // ลาพักผ่อนทำ carry over
        newRemainingDays = receiveDays + carryOverDays;
      } else {
        // ประเภทอื่นๆ ใช้ receiveDays ปกติ
        newRemainingDays = receiveDays;
      }

      const balanceData = {
        userId,
        leaveTypeId,
        maxDays: (receiveDays === 0 && isBalance === 1) ? 0 : maxDays,
        usedDays: (receiveDays === 0 && isBalance === 1) ? 0 : 0,
        pendingDays: (receiveDays === 0 && isBalance === 1) ? 0 : 0,
        remainingDays: (receiveDays === 0 && isBalance === 1) ? 0 : newRemainingDays,
        year: yearValue,
      };

      await prisma.leaveBalance.create({
        data: balanceData,
      });
    }
  }

  static async getAllApprover() {
    return await prisma.user.findMany({
      where: {
        userRoles: {
          some: {
            roleId: { in: [3, 4, 5, 6, 7] },
          },
        },
      },
      include: {
        userRoles: { include: { role: true } },
        department: true,
        positionNumbers: {
          where: { isCurrent: true },
          select: {
            positionNumber: true,
            effectiveFrom: true,
          },
        },
      },
    });
  }

  // Position Number Services
  static async updateUserPositionNumber(userId, newPositionNumber, changedByUserId) {
    return await prisma.$transaction(async (tx) => {
      // 1. ปิด record เก่าของ user
      await tx.userPositionNumber.updateMany({
        where: {
          userId,
          isCurrent: true,
        },
        data: {
          effectiveTo: new Date(),
          isCurrent: false,
        },
      });

      // 2. สร้าง record ใหม่
      const newPosition = await tx.userPositionNumber.create({
        data: {
          userId,
          positionNumber: newPositionNumber,
          effectiveFrom: new Date(),
          isCurrent: true,
        },
      });

      // 3. บันทึก audit log
      await tx.auditLog.create({
        data: {
          userId: changedByUserId,
          action: 'UPDATE_POSITION_NUMBER',
          entityType: 'User',
          entityId: userId,
          details: `Changed position number to ${newPositionNumber}`,
        },
      });

      return newPosition;
    });
  }

  static async getUserPositionNumberHistory(userId) {
    return await prisma.userPositionNumber.findMany({
      where: { userId },
      orderBy: { effectiveFrom: 'desc' },
      include: {
        user: {
          select: {
            prefixName: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
    });
  }

  static async getCurrentPositionNumber(userId) {
    const current = await prisma.userPositionNumber.findFirst({
      where: {
        userId,
        isCurrent: true,
      },
      select: {
        positionNumber: true,
        effectiveFrom: true,
      },
    });

    return current;
  }

  static async getPositionNumberByNumber(positionNumber) {
    return await prisma.userPositionNumber.findFirst({
      where: {
        positionNumber,
        isCurrent: true,
      },
      include: {
        user: {
          select: {
            id: true,
            prefixName: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
    });
  }
}

module.exports = UserService;
