const prisma = require('../config/prisma');
const createError = require('../utils/createError');

class UserService {
    static async createUser(data, department, organization) {
        try {
            if (data.hireDate) {
                data.hireDate = new Date(data.hireDate);
            }
    
            const newUser = await prisma.users.create({
                data,
            });
    
            if (department && department.length > 0) {
                await prisma.user_deparment.createMany({
                    data: department.map(deptId => ({
                        userId: newUser.id,
                        departmentId: deptId,
                        isHead: false // กำหนดค่าเริ่มต้นเป็นไม่ใช่หัวหน้าภาควิชา
                    }))
                });
            }
            if (organization && organization.length > 0) {
                await prisma.organization_department.createMany({
                    data: organization.map(orgId => ({
                        organizationId: orgId,
                        departmentId: department[0] // 🔥 อ้างอิงจาก departmentId ตัวแรก (ถ้ามีหลายภาควิชาอาจต้องปรับ logic)
                    }))
                });
            }
            return newUser;
        } catch (err) {
            if (err.code === 'P2002') { 
                throw createError(400, 'Email or username already exists');
            }
            throw err;
        }
    }
    static async getUserByIdWithRoles(id) {
        return await prisma.users.findUnique({
            where: { id },
            include: { 
                user_role: {
                    include: {
                        roles: true
                    }
                }
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
            }
        });
    }
    static async updateUser(userEmail, data) {
        try {
            const userExists = await prisma.users.findUnique({
                where: { email: userEmail },
            });
            if (!userExists) {
                createError(404, 'User not found');
            }

            const updatedUser = await prisma.users.update({
                where: { email: userEmail },
                data,
            });

            return updatedUser;
        } catch {
            createError(400, 'Failed to update');
        }
    }
    static async updateUserById(userId, data, department, organization) {
        try {
            const user = await prisma.users.findUnique({
                where: { id: userId },
            });

            if (!user) {
                throw createError(404, 'User not found');
            }

            const updatedUser = await prisma.users.update({
                where: { id: userId },
                data: data,
            });

            if (department && department.length > 0) {
                await prisma.user_deparment.deleteMany({
                    where: { userId: userId },
                });

                await prisma.user_deparment.createMany({
                    data: department.map(depId => ({
                        userId: userId,
                        departmentId: depId,
                        isHead: false
                    }))
                });
            }

            if (organization && organization.length > 0) {
                await prisma.organization_department.deleteMany({
                    where: {
                        departmentId: { in: department }
                    }
                });

                await prisma.organization_department.createMany({
                    data: organization.map(orgId => ({
                        organizationId: orgId,
                        departmentId: department[0]
                    }))
                });
            }

            return updatedUser;
        } catch (err) {
            if (err.code === 'P2002') { // ข้อผิดพลาด duplicate key (เช่น email ซ้ำ)
                throw createError(400, 'Email or username already exists');
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
                throw createError(404, 'User not found');
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
                        }
                    },
                    user_deparment: {
                        include: {
                            departments: {
                                include: {
                                    organization_department: {
                                        include: {
                                            organizations: true
                                        }
                                    }
                                }
                            }
                        }
                    }
                },
            });

            return user.map(({ password, ...rest }) => rest);
        } catch (err) {
            console.error("Error in getUserLanding", err);
            throw new Error('Error while fetching user data');
        }
    }
    static async updateUserRole(userId, roleIds) {
       try {
         await prisma.user_role.deleteMany({
             where: { userId },
         });
         const userRoles = roleIds.map(roleId => ({
             userId,
             roleId,
         }));
         return await prisma.user_role.createMany({
             data: userRoles,
         });
       } catch (err) {
            throw new Error('Failed to update user roles');
       }
    }
    static async getRolesByNames(roleNames) {
        return await prisma.roles.findMany({
            where: { name: { in: roleNames } }
        });
    }
    static async assignRolesToUser(userId, roleIds) {
        const userRoles = roleIds.map(roleId => ({
            userId,
            roleId,
        }));
        return await prisma.user_role.createMany({
            data: userRoles,
        });
    }
    static async getDepartment(userId) {
        const departments = await prisma.user_deparment.findMany({
            where: { userId: userId },
            select: {
                departments: {
                    select: {
                        id: true,
                        name: true,
                    }
                }
            }
        });
        return departments;
    }
    static async getOrganization(userId) {
        const organizations = await prisma.organization_department.findMany({
            where: {
                departments: {
                    user_deparment: {
                        some: { userId: userId },
                    }
                }
            },
            select: {
                organizations: {
                    select: {
                        id: true,
                        name: true,
                    }
                }
            }
        });
        return organizations;
    }
    static async getVerifier() {
        const verifier = await prisma.users.findFirst({
            where: { role: "VERIFIER" },
            select: { id: true }
        });

        if (!verifier) {
            throw createError(500, "No verifier found in the system.");
        }
        return verifier.id;
    }
    static async getReceiver() {
        const receiver = await prisma.users.findFirst({
            where: { role: "RECEIVER" },
            select: { id: true },
        });

        if (!receiver) {
            throw createError(500, "No receiver found in the system.");
        }
        return receiver.id;
    }
    static async getHeadOfDepartment(departmentId) {
        const head = await prisma.user_department.findFirst({
            where: {
                departmentId: departmentId,
                isHead: true,
            },
            select: { userId: true }
        });

        return head ? head.userId : null;
    }
}

module.exports = UserService;