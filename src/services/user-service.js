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
    static async getUserById(id) {
        return await prisma.users.findUnique({
            where: { id },
            include: { personnelType: true },
        });
    }
    static async getUserByEmail(email) {
        return await prisma.users.findUnique({
            where: { email },
            include: {
                personnelType: true,
                organization: true,
                department: true,
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
    static async getUserLanding() {
        try {
            const user = await prisma.users.findMany({
                include: {
                    personnelType: true,
                    department: true,
                },
            });

            return user.map(({ password, ...rest }) => rest);
        } catch (err) {
            throw new Error('Error for landing');
        }
    }
    static async updateUserRole(userId, roleIds) {
        await prisma.user_Role.deleteMany({
            where: { userId },
        });
        const userRoles = roleIds.map(roleId => ({
            userId,
            roleId,
        }));
        return await prisma.user_Role.createMany({
            data: userRoles,
        });
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
        return await prisma.user_Role.createMany({
            data: userRoles,
        });
    }
}

module.exports = UserService;