const prisma = require('../config/prisma');
const createError = require('../utils/createError');

class UserService {
    static async createUser(data) {
        if (data.hireDate) {
            data.hireDate = new Date(data.hireDate);
        }

        return await prisma.users.create({
            data,
        });
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
    static async updateUserById(userId, data) {
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

            return updatedUser;
        } catch (err) {
            if (err.code === 'P2002') { // ข้อผิดพลาด duplicate key (เช่น email หรือ username ซ้ำ)
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
                    organizations: true,
                    departments: true,
                    user_role: {
                        include: {
                            roles: true,
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
}

module.exports = UserService;