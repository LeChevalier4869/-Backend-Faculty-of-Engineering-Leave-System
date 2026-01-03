const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function removeWrongProxy() {
  try {
    console.log('🔧 กำลังลบข้อมูล proxy ที่เพิ่มผิด...');

    // ลบ proxy สำหรับ level 5 ที่เพิ่มผิด
    const wrongProxy = await prisma.proxyApproval.findFirst({
      where: {
        proxyApproverId: 11,
        approverLevel: 5,
        originalApproverId: 12
      }
    });

    if (wrongProxy) {
      console.log('🗑️ ลบ proxy Level 5 ที่เพิ่มผิด:', wrongProxy.id);
      await prisma.proxyApproval.delete({
        where: { id: wrongProxy.id }
      });
      console.log('✅ ลบข้อมูลผิดเรียบร้อย');
    } else {
      console.log('ℹ️ ไม่พบข้อมูล proxy ที่เพิ่มผิด');
    }

    // แสดงข้อมูล proxy ปัจจุบันของ User11
    const currentProxies = await prisma.proxyApproval.findMany({
      where: { proxyApproverId: 11 },
      include: {
        originalApprover: {
          select: { firstName: true, lastName: true }
        }
      }
    });

    console.log('📋 ข้อมูล proxy ปัจจุบันของ User11:');
    currentProxies.forEach(p => {
      console.log(`  - Level ${p.approverLevel}: ${p.originalApprover.firstName} ${p.originalApprover.lastName} (${p.status})`);
    });

  } catch (error) {
    console.error('❌ เกิดข้อผิดพลาด:', error);
  } finally {
    await prisma.$disconnect();
  }
}

removeWrongProxy();
