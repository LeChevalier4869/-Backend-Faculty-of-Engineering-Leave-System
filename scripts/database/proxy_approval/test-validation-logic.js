const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function testValidationLogic() {
  try {
    console.log('🧪 ทดสอบ Validation Logic...');
    
    // ดึงข้อมูล User11 พร้อม roles
    const user11 = await prisma.user.findUnique({
      where: { id: 11 },
      include: {
        userRoles: { include: { role: true } }
      }
    });

    console.log('📋 User11 Roles:');
    user11.userRoles.forEach(ur => {
      console.log(`  - ${ur.role.name}`);
    });

    // ทดสอบแต่ละ level
    const levels = [
      { level: 2, roleName: 'VERIFIER', expected: false },
      { level: 3, roleName: 'APPROVER_2', expected: true }
    ];

    for (const test of levels) {
      console.log(`\n🔍 Level ${test.level} (${test.roleName}):`);
      
      const hasOriginalRole = user11.userRoles.some(ur => ur.role.name === test.roleName);
      console.log(`  - มี ${test.roleName} role: ${hasOriginalRole}`);
      console.log(`  - Expected isProxy: ${test.expected}`);
      console.log(`  - Actual isProxy: ${!hasOriginalRole}`);
      console.log(`  - 📊 Result: ${(!hasOriginalRole === test.expected) ? '✅ PASS' : '❌ FAIL'}`);
    }

    // ทดสอบผ่าน API
    console.log('\n🌐 ทดสอบผ่าน API:');
    const axios = require('axios');
    
    for (const test of levels) {
      try {
        const response = await axios.get(`http://localhost:8000/auth/approvers-for-level/${test.level}?date=2026-01-02`, {
          headers: { Authorization: 'Bearer test-token' }
        });
        
        const user11Data = response.data.data.find(u => u.id === 11);
        console.log(`  - Level ${test.level} API isProxy: ${user11Data?.isProxy || false}`);
        console.log(`  - Expected: ${test.expected}`);
        console.log(`  - 📊 API Result: ${(user11Data?.isProxy === test.expected) ? '✅ PASS' : '❌ FAIL'}`);
        
      } catch (error) {
        console.log(`  - Level ${test.level} API: ❌ ERROR`);
      }
    }

    console.log('\n🎉 ทดสอบเสร็จสิ้น!');

  } catch (error) {
    console.error('❌ เกิดข้อผิดพลาด:', error);
  } finally {
    await prisma.$disconnect();
  }
}

testValidationLogic();
