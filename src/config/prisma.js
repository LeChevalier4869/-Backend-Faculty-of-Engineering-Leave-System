const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

//mini prisma middleware

// prisma.$use(async (URLSearchParams, next) => {
//     const result = await next(params);
//     if (params.model === 'users' && result) {
//         delete result.password;
//     }
//     return result;
// });

module.exports = prisma;