const prisma = require('../config/prisma');

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
}

module.exports = UserService;