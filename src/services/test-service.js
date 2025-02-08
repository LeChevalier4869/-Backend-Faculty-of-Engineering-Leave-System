const prisma = require('../config/prisma');
const createError = require('../utils/createError');

class TestService {
    static async TestService(userId) {
        if (isNaN(userId) || typeof userId !== Number) {
            return createError(400, 'User ID is not a number');
        }

        
    }
}

module.exports = TestService;