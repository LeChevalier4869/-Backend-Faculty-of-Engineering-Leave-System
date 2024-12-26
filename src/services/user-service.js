const prisma = require('../config/prisma');
const createError = require('../utils/createError');

class UserService {
    static async createUser(data) {
        return await prisma.users.create({
            data,
        });
    }
    static async getUserByEmail(email) {
        return await prisma.users.findUnique({
            where: { email },
        });
    }
    static async updateUser(userId, data) {
        try {
            const userExists = await prisma.users.findUnique({
                where: { id: userId },
            });
            if (!userExists) {
                createError(404, 'User not found');
            }

            const updatedUser = await prisma.users.update({
                where: { id: userId },
                data,
            });

            return updatedUser;
        } catch {
            createError(400, 'Failed to update');
        }
    }
}

module.exports = UserService;