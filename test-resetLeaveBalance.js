const { PrismaClient } = require('@prisma/client');

// จำลองข้อมูลสำหรับทดสอบ
const mockData = {
  users: [
    { id: 1, personnelTypeId: 1, hireDate: '2020-01-01' },
    { id: 2, personnelTypeId: 2, hireDate: '2021-06-15' }
  ],
  leaveTypes: [
    { id: 4, name: 'ลาพักผ่อน', resetOnFiscalYear: false }, // ไม่รีเซ็ต
    { id: 5, name: 'ลาป่วย', resetOnFiscalYear: true },     // รีเซ็ตตามปกติ
    { id: 6, name: 'ลากิจส่วนตัว', resetOnFiscalYear: true }
  ],
  currentBalances: [
    { userId: 1, leaveTypeId: 4, year: 2025, remainingDays: 5, usedDays: 10, pendingDays: 2 },
    { userId: 1, leaveTypeId: 5, year: 2025, remainingDays: 3, usedDays: 5, pendingDays: 1 },
    { userId: 2, leaveTypeId: 4, year: 2025, remainingDays: 8, usedDays: 7, pendingDays: 0 }
  ],
  ranks: [
    { userId: 1, leaveTypeId: 4, maxDays: 10, receiveDays: 10, isBalance: 1 },
    { userId: 1, leaveTypeId: 5, maxDays: 30, receiveDays: 30, isBalance: 1 },
    { userId: 1, leaveTypeId: 6, maxDays: 6, receiveDays: 6, isBalance: 1 },
    { userId: 2, leaveTypeId: 4, maxDays: 10, receiveDays: 10, isBalance: 1 },
    { userId: 2, leaveTypeId: 5, maxDays: 30, receiveDays: 30, isBalance: 1 }
  ],
  previousYearBalances: [
    { userId: 1, leaveTypeId: 5, year: 2024, remainingDays: 2 }, // สำหรับ carry over
    { userId: 2, leaveTypeId: 5, year: 2024, remainingDays: 1 }
  ]
};

// จำลอง Prisma Client
const mockPrisma = {
  setting: {
    findUnique: async ({ where }) => {
      if (where.key === 'fiscalYear') {
        return { value: '2025' };
      }
      return null;
    }
  },
  leaveBalance: {
    findMany: async ({ where }) => {
      if (where.year === 2025) {
        return mockData.currentBalances;
      }
      if (where.year === 2024) {
        return mockData.previousYearBalances;
      }
      return [];
    },
    findFirst: async ({ where }) => {
      return mockData.currentBalances.find(b => 
        b.userId === where.userId && 
        b.leaveTypeId === where.leaveTypeId && 
        b.year === where.year
      ) || mockData.previousYearBalances.find(b => 
        b.userId === where.userId && 
        b.leaveTypeId === where.leaveTypeId && 
        b.year === where.year
      );
    },
    create: async ({ data }) => {
      console.log(`📝 [MOCK] สร้าง LeaveBalance:`, data);
      return { id: Math.random(), ...data };
    },
    update: async ({ where, data }) => {
      console.log(`📝 [MOCK] อัปเดต LeaveBalance:`, { where, data });
      return { ...where, ...data };
    }
  },
  userRank: {
    deleteMany: async () => {
      console.log(`🧹 [MOCK] ลบข้อมูล userRank ทั้งหมด`);
      return { count: mockData.ranks.length };
    },
    findMany: async ({ where, include }) => {
      const userRanks = mockData.ranks.filter(r => r.userId === where.userId);
      return userRanks.map(r => ({
        ...r,
        rank: { 
          leaveTypeId: r.leaveTypeId, 
          maxDays: r.maxDays, 
          receiveDays: r.receiveDays, 
          isBalance: r.isBalance 
        }
      }));
    }
  },
  user: {
    findMany: async ({ select }) => {
      return mockData.users.map(u => ({
        id: u.id,
        personnelTypeId: u.personnelTypeId,
        hireDate: u.hireDate
      }));
    }
  },
  leaveType: {
    findUnique: async ({ where, select }) => {
      const leaveType = mockData.leaveTypes.find(lt => lt.id === where.id);
      if (select?.resetOnFiscalYear) {
        return { resetOnFiscalYear: leaveType?.resetOnFiscalYear };
      }
      return leaveType;
    }
  }
};

// จำลอง UserService
const mockUserService = {
  assignRankToUser: async (userId, personnelTypeId, hireDate) => {
    console.log(`👤 [MOCK] กำหนด rank ให้ userId ${userId}, personnelType ${personnelTypeId}`);
  }
};

// ฟังก์ชัน resetLeaveBalance ที่แก้ไขแล้ว
async function testResetLeaveBalance() {
  console.log("🔄 เริ่มทดสอบ resetLeaveBalance");
  
  const fiscalYearSetting = await mockPrisma.setting.findUnique({
    where: { key: "fiscalYear" },
  });

  const year = fiscalYearSetting
    ? parseInt(fiscalYearSetting.value)
    : new Date().getFullYear();

  console.log(`📅 ปีงบประมาณ: ${year}`);

  // 🟡 ดึง LeaveBalance ของปีปัจจุบันเพื่อตรวจสอบว่ามีอยู่แล้วหรือไม่
  const currentLeaveBalances = await mockPrisma.leaveBalance.findMany({
    where: { year },
  });
  const existingMap = new Map();
  for (const lb of currentLeaveBalances) {
    const key = `${lb.userId}-${lb.leaveTypeId}`;
    existingMap.set(key, true);
  }

  console.log(`📊 พบ LeaveBalance ปัจจุบัน ${currentLeaveBalances.length} รายการ`);

  // ลบข้อมูล user_Rank ทั้งหมด
  await mockPrisma.userRank.deleteMany();

  // ดึงผู้ใช้งานทั้งหมดพร้อม personnelType และ hireDate
  const users = await mockPrisma.user.findMany({
    select: {
      id: true,
      personnelTypeId: true,
      hireDate: true,
    },
  });
  console.log(`👥 พบผู้ใช้ทั้งหมด ${users.length} คน`);

  // 4. วนลูปสร้าง user_Rank และ leaveBalance ใหม่
  for (const user of users) {
    const { id, personnelTypeId, hireDate } = user;
    if (!personnelTypeId || !hireDate) continue;
    
    await mockUserService.assignRankToUser(id, personnelTypeId, new Date(hireDate));
    
    // ดึง balance เก่ามาทบ เฉพาะของ ลาพักผ่อน (leaveType === 4) ที่ยังรีเซ็ตปีใหม่อยู่
    const leaveType4 = await mockPrisma.leaveType.findUnique({
      where: { id: 4 },
      select: { resetOnFiscalYear: true }
    });
    
    let carryOverDays = 0;
    if (leaveType4?.resetOnFiscalYear) {
      const balanceVacation = await mockPrisma.leaveBalance.findFirst({
        where: { userId: id, leaveTypeId: 4, year: year - 1 },
        select: { remainingDays: true },
      });
      carryOverDays = balanceVacation?.remainingDays ?? 0;
    }
    
    const userRanks = await mockPrisma.userRank.findMany({
      where: { userId: id },
      include: { rank: true },
    });

    console.log(`🔍 ผู้ใช้ ${id}: พบ ${userRanks.length} ประเภทการลา`);

    for (const ur of userRanks) {
      const { leaveTypeId, maxDays, receiveDays, isBalance } = ur.rank;
      if (!leaveTypeId || maxDays === null) continue;

      // ตรวจสอบว่า leaveType นี้ต้องรีเซ็ตปีใหม่หรือไม่
      const leaveType = await mockPrisma.leaveType.findUnique({
        where: { id: leaveTypeId },
        select: { resetOnFiscalYear: true }
      });

      // สำหรับประเภทที่ต้องหักวัน
      const daysToUse = receiveDays > 0 ? receiveDays : maxDays;
      
      let newRemainingDays;
      let balanceData;
      
      if (Number(leaveTypeId) === 4) {
        // ลาพักผ่อน: ถ้าไม่รีเซ็ตปีใหม่ ให้เพิ่มวันลาใหม่เข้าไปใน balance เดิม
        const currentBalance = await mockPrisma.leaveBalance.findFirst({
          where: { userId: id, leaveTypeId: 4, year },
          select: { remainingDays: true }
        });
        
        const currentRemaining = currentBalance?.remainingDays ?? 0;
        newRemainingDays = currentRemaining + daysToUse;
        console.log(`💰 ลาพักผ่อน userId ${id}: เดิม ${currentRemaining} + ใหม่ ${daysToUse} = ${newRemainingDays}`);
        
        balanceData = {
          userId: id,
          leaveTypeId,
          maxDays,
          usedDays: 0,
          pendingDays: 0,
          remainingDays: newRemainingDays >= maxDays ? maxDays : newRemainingDays,
          year,
        };
      } else if (leaveType?.resetOnFiscalYear) {
        // ประเภทอื่นๆ ที่รีเซ็ตปีใหม่: ใช้ logic เดิม
        newRemainingDays = daysToUse + carryOverDays;
        console.log(`📝 LeaveType ${leaveTypeId} userId ${id}: ใหม่ ${daysToUse} + carryOver ${carryOverDays} = ${newRemainingDays}`);
        
        balanceData = {
          userId: id,
          leaveTypeId,
          maxDays,
          usedDays: 0,
          pendingDays: 0,
          remainingDays: newRemainingDays >= maxDays ? maxDays : newRemainingDays,
          year,
        };
      } else {
        // ประเภทที่ไม่รีเซ็ตปีใหม่ (ยกเว้นลาพักผ่อนที่จัดการข้างต้น)
        console.log(`⏭️ ข้าม LeaveType ${leaveTypeId} (ไม่รีเซ็ตปีใหม่)`);
        continue;
      }

      const key = `${id}-${leaveTypeId}`;
      if (existingMap.has(key)) {
        // ถ้ามีอยู่แล้ว ให้อัปเดต (สำหรับลาพักผ่อนที่ไม่รีเซ็ต)
        await mockPrisma.leaveBalance.update({
          where: {
            userId_leaveTypeId_year: {
              userId: id,
              leaveTypeId,
              year
            }
          },
          data: balanceData,
        });
      } else {
        // สร้างเฉพาะที่ยังไม่มี
        await mockPrisma.leaveBalance.create({
          data: balanceData,
        });
      }
    }
  }

  console.log("🎉 ทดสอบ resetLeaveBalance เสร็จสิ้น");
}

// รันการทดสอบ
testResetLeaveBalance().catch(console.error);
