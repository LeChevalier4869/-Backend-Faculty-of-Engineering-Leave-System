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
      const departmentExists = await prisma.departments.findUnique({
        where: { id: parseInt(data.departmentId) },
      });
      if (!departmentExists) {
        throw createError(
          400,
          "Invalid departmentId: ไม่มีภาควิชานี้อยู่ในระบบ"
        );
      }

      const organizationExists = await prisma.organizations.findUnique({
        where: { id: parseInt(data.organizationId) },
      });
      if (!organizationExists) {
        throw createError(
          400,
          "Invalid organizationId: ไม่มีหน่วยงานนี้อยู่ในระบบ"
        );
      }

      const newUser = await prisma.users.create({
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
    return await prisma.users.findUnique({
      where: { id: userId },
      include: {
        user_role: {
          include: {
            roles: true,
          },
        },
        personneltypes: true,
        organizations: true,
        departments: true,
        leavebalances: true,
        leaverequests: {
          include: {
            approvalsteps: true,
          },
        },
      },
    });
  }
  static async getUserByIdWithRoles(id) {
    return await prisma.users.findUnique({
      where: { id },
      include: {
        user_role: {
          include: {
            roles: true,
          },
        },
        departments: true,
        organizations: true,
        personneltypes: true,
      },
    });
  }
  static async getUserByEmail(email) {
    return await prisma.users.findUnique({
      where: { email },
      include: {
        personneltypes: true,
        organizations: true,
        departments: true,
      },
    });
  }
  static async updateUser(userEmail, data) {
    try {
      const userExists = await prisma.users.findUnique({
        where: { email: userEmail },
      });
      if (!userExists) {
        createError(404, "User not found");
      }

      const updatedUser = await prisma.users.update({
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
      const user = await prisma.users.findUnique({
        where: { id: userId },
      });

      if (!user) {
        throw createError(404, "User not found");
      }

      const updatedUser = await prisma.users.update({
        where: { id: userId },
        data: data,
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
      const user = await prisma.users.findUnique({
        where: { id: userId },
      });

      if (!user) {
        throw createError(404, "User not found");
      }

      const updateUserStatus = await prisma.users.update({
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
      const user = await prisma.users.findMany({
        include: {
          personneltypes: true,
          user_role: {
            include: {
              roles: true,
            },
          },
          organizations: true,
          departments: true,
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
      await prisma.user_role.deleteMany({
        where: { userId },
      });
      const userRoles = roleIds.map((roleId) => ({
        userId,
        roleId,
      }));
      return await prisma.user_role.createMany({
        data: userRoles,
      });
    } catch (err) {
      throw new Error("Failed to update user roles");
    }
  }
  static async getRolesByNames(roleNames) {
    return await prisma.roles.findMany({
      where: { name: { in: roleNames } },
    });
  }

  static async createUserProfile(userId, imgUrl) {
    return await prisma.users.update({
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
    return await prisma.user_role.createMany({
      data: userRoles,
    });
  }
  static async getDepartment(userId) {
    const departments = await prisma.users.findUnique({
      where: { id: userId },
      select: {
        departments: {
          select: {
            id: true,
            name: true,
            isHeadId: true,
            organizationId: true,
          },
        },
      },
    });
    return departments ? departments.departments : null;
  }
  static async getOrganization(userId) {
    const organizations = await prisma.users.findUnique({
      where: { id: userId },
      select: {
        organizations: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });
    return organizations ? organizations.organizations : null;
  }
  static async getPersonnelType(userId) {
    const personnelType = await prisma.users.findUnique({
      where: { id: userId },
      select: {
        personneltypes: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });
    return personnelType ? personnelType.personneltypes : null;
  }
  static async getVerifier() {
    const verifier = await prisma.user_role.findFirst({
      where: { roleId: 7 }, //role is verifier
      select: {
        userId: true,
      },
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
    const receiver = await prisma.user_role.findFirst({
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

    const department = await prisma.departments.findUnique({
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
    return department.isHeadId;
  }
}

module.exports = UserService;
