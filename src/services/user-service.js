const prisma = require("../config/prisma");
const createError = require("../utils/createError");

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
    const verifier = await prisma.role.findFirst({
      where: { name: "VERIFIER" }, //role is verifier
      some: {
        userRoles: {
          some: {
            user: true,
          }
        }
      }
    });

    if (!verifier || verifier === null) {
      throw createError(400, `verifier is ${verifier}`);
    }

    // console.log('Debug verifier ID: ', verifier.userId);

    // const verifier = await prisma.users.findFirst({
    //   where: { id: userRole },
    //   select: { id: true },
    // });

    if (!verifier) {
      throw createError(500, "No verifier found in the system.");
    }
    return verifier.userId;
  }
  static async getReceiver() {
    const receiver = await prisma.user_Role.findFirst({
      where: { roleId: 8 },
      select: { userId: true },
    });

    if (!receiver || receiver === null) {
      throw createError(400, `receiver is ${receiver}`);
    }

    // console.log('Debug verifier ID: ', verifier.userId);

    // const receiver = await prisma.users.findFirst({
    //   where: { role: "RECEIVER" },
    //   select: { id: true },
    // });

    if (!receiver) {
      throw createError(500, "No receiver found in the system.");
    }
    return receiver.userId;
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
}

module.exports = UserService;
