const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function cleanAllUser11Proxies() {
  try {
    console.log('🔧 กำลังลบข้อมูล proxy ทั้งหมดของ User11...');

    // แสดงข้อมูลปัจจุบัน
    const currentProxies = await prisma.proxyApproval.findMany({
      where: { proxyApproverId: 11 },
      include: {
        originalApprover: {
          select: { firstName: true, lastName: true }
        }
      }
    });

    console.log('📋 ข้อมูล proxy ปัจจุบัน:');
    currentProxies.forEach(p => {
      console.log(`  - Level ${p.approverLevel}: ${p.originalApprover.firstName} ${p.originalApprover.lastName} (${p.status}) - ID: ${p.id}`);
    });

    // ลบทั้งหมด
    if (currentProxies.length > 0) {
      console.log('🗑️ กำลังลบทั้งหมด...');
      
      const deleteResult = await prisma.proxyApproval.deleteMany({
        where: { proxyApproverId: 11 }
      });
      
      console.log(`✅ ลบข้อมูลสำเร็จ ${deleteResult.count} รายการ`);
    } else {
      console.log('ℹ️ ไม่มีข้อมูล proxy ของ User11');
    }

    // ตรวจสอบผลลัพธ์
    const remainingProxies = await prisma.proxyApproval.findMany({
      where: { proxyApproverId: 11 }
    });

    console.log(`📋 ข้อมูลที่เหลือ: ${remainingProxies.length} รายการ`);

  } catch (error) {
    console.error('❌ เกิดข้อผิดพลาด:', error);
  } finally {
    await prisma.$disconnect();
  }
}

cleanAllUser11Proxies();
