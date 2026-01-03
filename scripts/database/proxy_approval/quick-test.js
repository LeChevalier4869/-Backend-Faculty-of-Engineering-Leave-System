const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function quickTest() {
  try {
    console.log('⚡ ทดสอบ Validation แบบ Direct...');
    
    // ดึงข้อมูล User11
    const user11 = await prisma.user.findUnique({
      where: { id: 11 },
      include: { userRoles: { include: { role: true } } }
    });

    console.log('📋 User11 Roles:', user11.userRoles.map(ur => ur.role.name));

    // ทดสอบ validation logic ตรงๆ
    const testCases = [
      { level: 2, roleName: 'VERIFIER', expected: true },
      { level: 3, roleName: 'APPROVER_2', expected: true },
      { level: 1, roleName: 'APPROVER_1', expected: false }
    ];

    for (const test of testCases) {
      const hasRole = user11.userRoles.some(ur => ur.role.name === test.roleName);
      const shouldBeProxy = !hasRole;
      
      console.log(`\n🔍 Level ${test.level} (${test.roleName}):`);
      console.log(`  - มี role: ${hasRole}`);
      console.log(`  - ควรเป็น proxy: ${shouldBeProxy}`);
      console.log(`  - ✅ Expected: ${test.expected}`);
      console.log(`  - 🎯 Actual: ${shouldBeProxy}`);
      console.log(`  - 📊 Result: ${shouldBeProxy === test.expected ? '✅ PASS' : '❌ FAIL'}`);
    }

    // ตรวจสอบ proxy data
    const proxies = await prisma.proxyApproval.findMany({
      where: { proxyApproverId: 11, status: 'ACTIVE' }
    });

    console.log(`\n📋 Proxy Data: ${proxies.length} รายการ`);
    proxies.forEach(p => {
      console.log(`  - Level ${p.approverLevel}: ${p.startDate} - ${p.endDate}`);
    });

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

quickTest();
