const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function createTestData() {
  try {
    console.log('=== Creating Test Data ===');
    
    // Get some users for testing
    const users = await prisma.user.findMany({
      take: 4,
      select: { id: true, firstName: true, lastName: true, email: true }
    });
    
    if (users.length < 2) {
      console.log('❌ Need at least 2 users to create test data');
      return;
    }
    
    console.log(`👥 Found ${users.length} users for testing`);
    
    // Create a test proxy approval
    const testProxyApproval = await prisma.proxyApproval.create({
      data: {
        originalApproverId: users[0].id,
        proxyApproverId: users[1].id,
        approverLevel: 1,
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-12-31'),
        reason: 'ทดสอบการมอบอำนาจระหว่างวันลาพักผ่อน',
        isDaily: false,
        dailyDate: null,
      },
      include: {
        originalApprover: {
          select: { firstName: true, lastName: true, email: true }
        },
        proxyApprover: {
          select: { firstName: true, lastName: true, email: true }
        }
      }
    });
    
    console.log('✅ Created test proxy approval:');
    console.log(`  ID: ${testProxyApproval.id}`);
    console.log(`  Original: ${testProxyApproval.originalApprover.firstName} ${testProxyApproval.originalApprover.lastName}`);
    console.log(`  Proxy: ${testProxyApproval.proxyApprover.firstName} ${testProxyApproval.proxyApprover.lastName}`);
    console.log(`  Level: ${testProxyApproval.approverLevel}`);
    console.log(`  Status: ${testProxyApproval.status}`);
    console.log(`  Daily: ${testProxyApproval.isDaily}`);
    console.log(`  Period: ${testProxyApproval.startDate} to ${testProxyApproval.endDate}`);
    
    // Create a daily proxy approval test
    if (users.length >= 3) {
      const dailyProxyApproval = await prisma.proxyApproval.create({
        data: {
          originalApproverId: users[1].id,
          proxyApproverId: users[2].id,
          approverLevel: 2,
          startDate: new Date('2024-01-15'),
          endDate: new Date('2024-01-15'),
          reason: 'ทดสอบการมอบอำนาจรายวัน',
          isDaily: true,
          dailyDate: new Date('2024-01-15'),
        },
        include: {
          originalApprover: {
            select: { firstName: true, lastName: true, email: true }
          },
          proxyApprover: {
            select: { firstName: true, lastName: true, email: true }
          }
        }
      });
      
      console.log('\n✅ Created daily proxy approval:');
      console.log(`  ID: ${dailyProxyApproval.id}`);
      console.log(`  Original: ${dailyProxyApproval.originalApprover.firstName} ${dailyProxyApproval.originalApprover.lastName}`);
      console.log(`  Proxy: ${dailyProxyApproval.proxyApprover.firstName} ${dailyProxyApproval.proxyApprover.lastName}`);
      console.log(`  Level: ${dailyProxyApproval.approverLevel}`);
      console.log(`  Status: ${dailyProxyApproval.status}`);
      console.log(`  Daily: ${dailyProxyApproval.isDaily}`);
      console.log(`  Daily Date: ${dailyProxyApproval.dailyDate}`);
    }
    
    // Test API endpoints
    console.log('\n=== Testing API Endpoints ===');
    
    const allProxyApprovals = await prisma.proxyApproval.findMany({
      include: {
        originalApprover: {
          select: { firstName: true, lastName: true, email: true }
        },
        proxyApprover: {
          select: { firstName: true, lastName: true, email: true }
        }
      }
    });
    
    console.log(`📊 Total ProxyApprovals: ${allProxyApprovals.length}`);
    
    const activeProxyApprovals = await prisma.proxyApproval.findMany({
      where: { status: 'ACTIVE' },
      include: {
        originalApprover: {
          select: { firstName: true, lastName: true, email: true }
        },
        proxyApprover: {
          select: { firstName: true, lastName: true, email: true }
        }
      }
    });
    
    console.log(`📊 Active ProxyApprovals: ${activeProxyApprovals.length}`);
    
    const dailyProxyApprovals = await prisma.proxyApproval.findMany({
      where: { isDaily: true },
      include: {
        originalApprover: {
          select: { firstName: true, lastName: true, email: true }
        },
        proxyApprover: {
          select: { firstName: true, lastName: true, email: true }
        }
      }
    });
    
    console.log(`📊 Daily ProxyApprovals: ${dailyProxyApprovals.length}`);
    
    console.log('\n=== Test Data Created Successfully ===');
    console.log('✅ Database is ready for frontend testing');
    console.log('✅ API endpoints can be tested');
    
  } catch (error) {
    console.error('❌ Test data creation error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

createTestData();
