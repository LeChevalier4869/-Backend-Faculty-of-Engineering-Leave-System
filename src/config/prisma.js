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

// ✅ เพิ่ม graceful shutdown handler
process.once('SIGINT', async () => {
  console.log('\n🛑 SIGINT received. Disconnecting Prisma...');
  await prisma.$disconnect();
  console.log('✅ Prisma disconnected. Exiting process.');
  process.exit(0);
});

module.exports = prisma;
