// const { PrismaClient } = require('@prisma/client');
// const prisma = new PrismaClient();

// //mini prisma middleware

// // prisma.$use(async (URLSearchParams, next) => {
// //     const result = await next(params);
// //     if (params.model === 'users' && result) {
// //         delete result.password;
// //     }
// //     return result;
// // });

// module.exports = prisma;

// ./config/prisma.js
const { PrismaClient } = require('@prisma/client');

let prisma;

if (process.env.NODE_ENV === 'production') {
    prisma = new PrismaClient();
} else {
    if (!global.prisma) {
        global.prisma = new PrismaClient();
    }
    prisma = global.prisma;
}

module.exports = prisma;
