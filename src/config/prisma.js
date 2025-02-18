const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

//mini prisma middleware

prisma.$use(async (params, next) => {
    const result = await next(params);
    if (params.model === 'User' && result) {
            // กรณีผลลัพธ์เป็น Array (findMany)
    if (Array.isArray(result)) {
      result.forEach(user => delete user.password);
    } else {
      delete result.password;
    }
    }
    return result;
});

module.exports = prisma;