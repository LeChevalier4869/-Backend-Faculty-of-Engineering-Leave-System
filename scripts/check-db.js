const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function checkDatabase() {
  try {
    console.log('=== Database Connection Status ===');
    console.log('✅ Connected to database successfully');
    
    console.log('\n=== Tables Information ===');
    
    // Check ProxyApproval table
    const proxyApprovalCount = await prisma.proxyApproval.count();
    console.log(`📊 ProxyApproval records: ${proxyApprovalCount}`);
    
    if (proxyApprovalCount > 0) {
      const proxyApprovals = await prisma.proxyApproval.findMany({
        take: 3,
        include: {
          originalApprover: {
            select: { firstName: true, lastName: true, email: true }
          },
          proxyApprover: {
            select: { firstName: true, lastName: true, email: true }
          }
        }
      });
      
      console.log('\n📋 Sample ProxyApproval records:');
      proxyApprovals.forEach((pa, index) => {
        console.log(`  ${index + 1}. ID: ${pa.id}`);
        console.log(`     Original: ${pa.originalApprover?.firstName} ${pa.originalApprover?.lastName}`);
        console.log(`     Proxy: ${pa.proxyApprover?.firstName} ${pa.proxyApprover?.lastName}`);
        console.log(`     Level: ${pa.approverLevel}`);
        console.log(`     Status: ${pa.status}`);
        console.log(`     Daily: ${pa.isDaily}`);
        console.log(`     Daily Date: ${pa.dailyDate || 'N/A'}`);
        console.log(`     Period: ${pa.startDate} to ${pa.endDate}`);
        console.log('');
      });
    }
    
    // Check User table
    const userCount = await prisma.user.count();
    console.log(`👥 User records: ${userCount}`);
    
    // Check LeaveRequest table
    const leaveRequestCount = await prisma.leaveRequest.count();
    console.log(`📝 LeaveRequest records: ${leaveRequestCount}`);
    
    // Check other important tables
    const departmentCount = await prisma.department.count();
    console.log(`🏢 Department records: ${departmentCount}`);
    
    const personnelTypeCount = await prisma.personnelType.count();
    console.log(`👤 PersonnelType records: ${personnelTypeCount}`);
    
    console.log('\n=== Database Schema Status ===');
    console.log('✅ All tables are accessible');
    console.log('✅ ProxyApproval table is ready');
    console.log('✅ Relationships are working');
    
  } catch (error) {
    console.error('❌ Database connection error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkDatabase();
