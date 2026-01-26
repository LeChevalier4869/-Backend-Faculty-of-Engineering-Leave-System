const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function fixProxyTime() {
  try {
    console.log('🔧 แก้ไขเวลา proxy ให้เป็น 00:00:00...');
    
    const proxies = await prisma.proxyApproval.findMany({
      where: { proxyApproverId: 11 }
    });

    for (const proxy of proxies) {
      // แปลงเวลาเป็น 00:00:00
      const newStartDate = new Date(proxy.startDate);
      newStartDate.setHours(0, 0, 0, 0);
      
      const newEndDate = new Date(proxy.endDate);
      newEndDate.setHours(0, 0, 0, 0);
      
      await prisma.proxyApproval.update({
        where: { id: proxy.id },
        data: {
          startDate: newStartDate,
          endDate: newEndDate
        }
      });
      
      console.log(`✅ Level ${proxy.approverLevel}: แก้เวลาเป็น ${newStartDate.toISOString()}`);
    }

    console.log('🎉 แก้ไขเวลาเรียบร้อยแล้ว!');
    
  } catch (error) {
    console.error('❌ เกิดข้อผิดพลาด:', error);
  } finally {
    await prisma.$disconnect();
  }
}

fixProxyTime();
