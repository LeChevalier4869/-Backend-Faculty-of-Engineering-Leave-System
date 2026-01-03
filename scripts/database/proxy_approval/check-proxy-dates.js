const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function checkProxyDates() {
  try {
    console.log('🔍 ตรวจสอบข้อมูล proxy ของ User11...');

    const proxies = await prisma.proxyApproval.findMany({
      where: { proxyApproverId: 11 },
      include: {
        originalApprover: {
          select: { firstName: true, lastName: true }
        }
      }
    });

    console.log('📋 ข้อมูลทั้งหมด:');
    proxies.forEach(p => {
      console.log(`  - Level ${p.approverLevel}: ${p.originalApprover.firstName} ${p.originalApprover.lastName}`);
      console.log(`    Status: ${p.status}`);
      console.log(`    Start: ${p.startDate}`);
      console.log(`    End: ${p.endDate}`);
      console.log(`    Today: ${new Date().toISOString().split('T')[0]}`);
      console.log('');
    });

    // ตรวจสอบวันที่ปัจจุบัน
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    console.log(`🗓️  Today (for query): ${today.toISOString()}`);

    // ตรวจสอบ active proxies สำหรับแต่ละ level
    for (let level = 2; level <= 3; level++) {
      const activeProxies = await prisma.proxyApproval.findMany({
        where: {
          approverLevel: level,
          status: 'ACTIVE',
          startDate: { lte: today },
          endDate: { gte: today }
        }
      });
      
      console.log(`🔍 Level ${level}: Found ${activeProxies.length} active proxies`);
      activeProxies.forEach(p => {
        console.log(`  - Proxy ${p.proxyApproverId} → Original ${p.originalApproverId}`);
      });
    }

  } catch (error) {
    console.error('❌ เกิดข้อผิดพลาด:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkProxyDates();
