// seed/seedLeaveBalance.js
const prisma = require("../src/config/prisma");

async function main() {
  const users = await prisma.user.findMany();
  const leaveTypes = await prisma.leaveType.findMany();

  for (const user of users) {
    for (const leaveType of leaveTypes) {
      const existing = await prisma.leaveBalance.findFirst({
        where: { userId: user.id, leaveTypeId: leaveType.id },
      });

      if (!existing) {
        await prisma.leaveBalance.create({
          data: {
            userId: user.id,
            leaveTypeId: leaveType.id,
            maxDays: 10, 
            usedDays: 0,
            pendingDays: 0,
            remainingDays: 10,
          },
        });
        console.log(`✅ Created balance for user ${user.id} / type ${leaveType.id}`);
      }
    }
  }
  console.log("✅ Leave balance seeded successfully.");
}

main()
  .catch((e) => console.error(e))
  .finally(() => prisma.$disconnect());
