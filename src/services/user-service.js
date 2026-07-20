const prisma = require("../config/prisma");
const createError = require("../utils/createError");

class UserService {
  static async createUser(data) {
    try {
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
        leaveBalances: {
          include: { leaveType: true },
          orderBy: [{ year: "desc" }, { leaveTypeId: "asc" }],
        },
        userRanks: {
          include: {
            rank: { include: { leaveType: true } },
          },
        },
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

  /**
   * ผู้อนุมัติของระดับที่ระบุ (รวมผู้รับมอบอำนาจที่ยัง active ในวันนั้น)
   *
   * @param {number} level  1=APPROVER_1 ... 5=APPROVER_4
   * @param {Date}   date   วันที่ใช้ตรวจช่วงเวลาการมอบอำนาจ
   * @param {number} [departmentId] ถ้าระบุและ level=1 จะกรองเฉพาะหัวหน้าสาขานั้น
   */
  static async getApproversForLevel(level, date, departmentId = null) {
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
          },
          // ระดับ 1 (หัวหน้าสาขา) ผูกกับสาขา — ถ้าระบุสาขามาให้กรองด้วย
          // ไม่งั้นจะได้หัวหน้าสาขา "ทุกสาขา" ซึ่งไม่เกี่ยวกับผู้ใช้ที่ถาม
          ...(level === 1 && departmentId
            ? { departmentId: Number(departmentId) }
            : {})
        },
        include: {
          userRoles: {
            include: {
              role: true
            }
          },
          // ให้ผู้เรียกแยกแยะได้ว่าใครอยู่สาขาไหน
          department: { select: { id: true, name: true } }
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

  // ตรวจว่าเป็นการลาเฉพาะเพศหญิง (ลาคลอด / ลาไปถือศีลปฏิบัติธรรม) เพื่อไม่ gen ให้ผู้ชาย
  static isFemaleOnlyLeave(leaveTypeName) {
    const name = String(leaveTypeName || "").toLowerCase();
    const isMaternity =
      (name.includes("คลอด") &&
        !name.includes("ช่วยเหลือภริยา") &&
        !name.includes("ภริยา")) ||
      name.includes("maternity");
    const isFemaleOrdination =
      name.includes("ถือศีล") ||
      (name.includes("ปฏิบัติธรรม") && !name.includes("บวช"));
    return isMaternity || isFemaleOrdination;
  }

  static async assignLeaveBalanceFromRanks(userId, sex = null) {
    const fiscalYearSetting = await prisma.setting.findUnique({
      where: { key: "fiscalYear" },
    });
    const yearValue = fiscalYearSetting
      ? parseInt(fiscalYearSetting.value, 10)
      : new Date().getFullYear();

    const userRanks = await prisma.userRank.findMany({
      where: { userId },
      include: {
        rank: { include: { leaveType: true } },
      },
    });

    for (const userRank of userRanks) {
      const { leaveTypeId, maxDays, receiveDays } = userRank.rank;

      // ข้ามถ้าไม่มี leaveTypeId หรือ maxDays
      if (!leaveTypeId || maxDays === null) continue;

      // ข้ามการลาเฉพาะเพศหญิงสำหรับผู้ใช้ชาย
      if (sex === "ชาย" && UserService.isFemaleOnlyLeave(userRank.rank.leaveType?.name)) {
        continue;
      }

      // ใช้เกณฑ์เดียวกับ import excel: leaveType.isNonDeductible
      const isNonDeductible = userRank.rank.leaveType?.isNonDeductible === true;

      let balanceData;
      if (isNonDeductible) {
        // ประเภทไม่หักวัน: เก็บแค่ usedDays (ผู้ใช้ใหม่ยังไม่เคยใช้ = 0)
        balanceData = {
          userId,
          leaveTypeId,
          maxDays: 0,
          usedDays: 0,
          pendingDays: 0,
          remainingDays: 0,
          year: yearValue,
        };
      } else {
        // ประเภทหักวัน: ผู้ใช้ใหม่ได้สิทธิ์ปัจจุบัน = receiveDays, ยังไม่ใช้ = 0
        const remaining =
          receiveDays !== null && receiveDays !== undefined ? receiveDays : maxDays;
        balanceData = {
          userId,
          leaveTypeId,
          maxDays,
          usedDays: 0,
          pendingDays: 0,
          remainingDays: remaining,
          year: yearValue,
        };
      }

      await prisma.leaveBalance.create({
        data: balanceData,
      });
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
      if (receiveDays === 0 && isBalance === true) {
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
        maxDays: (receiveDays === 0 && isBalance === true) ? 0 : maxDays,
        usedDays: (receiveDays === 0 && isBalance === true) ? 0 : 0,
        pendingDays: (receiveDays === 0 && isBalance === true) ? 0 : 0,
        remainingDays: (receiveDays === 0 && isBalance === true) ? 0 : newRemainingDays,
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

  /**
   * กำหนดเลขที่ตำแหน่งให้ user ภายใน transaction ที่ส่งเข้ามา (ใช้ตอนสร้าง user / import)
   * รองรับกรณีเลขซ้ำ: "ย้ายเลขมาคนใหม่" โดยปิด record ของเจ้าของเดิม
   * ทำงานภายใต้ unique constraint [positionNumber,isCurrent] และ [userId,isCurrent]
   * @param {object} tx - prisma transaction client
   * @param {number} userId - ผู้ใช้ที่จะได้รับเลขตำแหน่ง
   * @param {string} positionNumber - เลขที่ตำแหน่ง
   * @param {number|null} changedByUserId - ผู้ที่ทำรายการ (สำหรับ audit log)
   */
  static async assignPositionNumberToUser(tx, userId, positionNumber, changedByUserId = null) {
    const value = String(positionNumber).trim();
    if (!value) {
      throw createError(400, "ต้องระบุเลขที่ตำแหน่ง (positionNumber)");
    }
    const now = new Date();

    // 1) ปลดเลขนี้จากเจ้าของเดิม (ถ้ามีคนอื่นถืออยู่และเป็น current)
    const currentHolder = await tx.userPositionNumber.findFirst({
      where: { positionNumber: value, isCurrent: true },
    });
    if (currentHolder && currentHolder.userId !== userId) {
      // ลบ closed record ที่จะชนกับ unique [positionNumber,isCurrent=false] หรือ [holder,isCurrent=false]
      await tx.userPositionNumber.deleteMany({
        where: {
          isCurrent: false,
          OR: [{ positionNumber: value }, { userId: currentHolder.userId }],
        },
      });
      await tx.userPositionNumber.update({
        where: { id: currentHolder.id },
        data: { isCurrent: false, effectiveTo: now },
      });
    }

    // 2) ปิด record ปัจจุบันของ user เอง (ถ้ามีและคนละเลข)
    const ownCurrent = await tx.userPositionNumber.findFirst({
      where: { userId, isCurrent: true },
    });
    if (ownCurrent) {
      if (ownCurrent.positionNumber === value) {
        return ownCurrent; // ถือเลขนี้อยู่แล้ว ไม่ต้องทำอะไร
      }
      await tx.userPositionNumber.deleteMany({
        where: { userId, isCurrent: false },
      });
      await tx.userPositionNumber.update({
        where: { id: ownCurrent.id },
        data: { isCurrent: false, effectiveTo: now },
      });
    }

    // 3) สร้าง record ใหม่เป็น current
    const created = await tx.userPositionNumber.create({
      data: {
        userId,
        positionNumber: value,
        effectiveFrom: now,
        isCurrent: true,
      },
    });

    if (changedByUserId) {
      await tx.auditLog.create({
        data: {
          userId: changedByUserId,
          action: "ASSIGN_POSITION_NUMBER",
          entityType: "User",
          entityId: userId,
          details: `Assigned position number ${value}`,
        },
      });
    }

    return created;
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
