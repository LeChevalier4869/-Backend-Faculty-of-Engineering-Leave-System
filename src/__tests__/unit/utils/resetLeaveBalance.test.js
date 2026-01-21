// Mock Prisma
const mockPrisma = {
  setting: {
    findUnique: jest.fn().mockResolvedValue({
      key: 'fiscalYear',
      value: '2025'
    })
  },
  leaveBalance: {
    findMany: jest.fn().mockResolvedValue([]),
    findFirst: jest.fn().mockResolvedValue(null),
    deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    create: jest.fn().mockResolvedValue({ id: 1 }),
    update: jest.fn().mockResolvedValue({ id: 1 })
  },
  user: {
    findMany: jest.fn().mockResolvedValue([
      {
        id: 1,
        personnelTypeId: 1,
        hireDate: '2020-01-01'
      }
    ])
  },
  userRank: {
    findMany: jest.fn().mockResolvedValue([]),
    deleteMany: jest.fn().mockResolvedValue({ count: 0 })
  },
  leaveType: {
    findUnique: jest.fn().mockImplementation((params) => {
      if (params.where.id === 4) {
        return Promise.resolve({
          id: 4,
          resetOnFiscalYear: false,
          isNonDeductible: false
        });
      } else if (params.where.id === 5) {
        return Promise.resolve({
          id: 5,
          resetOnFiscalYear: true,
          isNonDeductible: true
        });
      } else if (params.where.id === 13) {
        return Promise.resolve({
          id: 13,
          resetOnFiscalYear: false,
          isNonDeductible: true
        });
      }
      return Promise.resolve({
        id: params.where.id,
        resetOnFiscalYear: true,
        isNonDeductible: false
      });
    })
  }
};

// Mock UserService
const mockUserService = {
  assignRankToUser: jest.fn().mockResolvedValue(true)
};

// Mock console
const mockConsole = {
  log: jest.fn(),
  error: jest.fn()
};

describe('resetLeaveBalance', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();
    
    // Mock require
    jest.doMock('../../../config/prisma', () => mockPrisma);
    jest.doMock('../../../services/user-service', () => mockUserService);
    
    // Mock console
    global.console = mockConsole;
  });

  // Require the module after mocks are set up
  let resetLeaveBalance;
  beforeEach(() => {
    resetLeaveBalance = require('../../../utils/resetLeaveBalance');
  });

  test('should skip non-reset leave types', async () => {
    // Mock กรณีประเภทที่ไม่รีเซ็ต
    mockPrisma.leaveBalance.findMany.mockResolvedValue([]);
    mockPrisma.userRank.findMany.mockResolvedValue([
      {
        rank: {
          leaveTypeId: 13,
          maxDays: 0,
          receiveDays: 0,
          isBalance: 0
        }
      }
    ]);
    
    await resetLeaveBalance();
    
    expect(mockConsole.log).toHaveBeenCalledWith(
      '⏭️ ข้าม LeaveType 13 (ไม่รีเซ็ตปีใหม่)'
    );
  });

  test('should handle empty current balances', async () => {
    // Mock กรณีไม่มี balance ปีปัจจุบัน
    mockPrisma.leaveBalance.findMany.mockResolvedValue([]);
    
    await resetLeaveBalance();
    
    expect(mockPrisma.leaveBalance.findMany).toHaveBeenCalledWith({
      where: { year: 2025 }
    });
    expect(mockPrisma.leaveBalance.deleteMany).toHaveBeenCalledWith({
      where: { year: 2025 }
    });
    expect(mockPrisma.userRank.deleteMany).toHaveBeenCalled();
    expect(mockUserService.assignRankToUser).toHaveBeenCalled();
    expect(mockConsole.log).toHaveBeenCalledWith(
      '⚠️ ไม่พบข้อมูล LeaveBalance ปีก่อน จะข้ามการ reset'
    );
    expect(mockConsole.log).toHaveBeenCalledWith('🧹 ลบข้อมูล LeaveBalance ปีปัจจุบันเรียบร้อย');
  });

  test('should handle vacation leave without reset', async () => {
    // Mock กรณีลาพักผ่อนไม่รีเซ็ต
    mockPrisma.leaveBalance.findMany.mockResolvedValue([]);
    mockPrisma.userRank.findMany.mockResolvedValue([
      {
        rank: {
          leaveTypeId: 4,
          maxDays: 10,
          receiveDays: 10,
          isBalance: 1
        }
      }
    ]);
    
    await resetLeaveBalance();
    
    expect(mockPrisma.leaveBalance.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 1,
        leaveTypeId: 4,
        maxDays: 10,
        remainingDays: 10,
        usedDays: 0,
        pendingDays: 0,
        year: 2025
      })
    });
    expect(mockConsole.log).toHaveBeenCalledWith(
      expect.stringContaining('💰 ลาพักผ่อน userId 1: เดิม 0 + ใหม่ 10 = 10')
    );
  });

  test('should handle non-deductible leave types', async () => {
    // Mock กรณีประเภทไม่ต้องหักวัน
    mockPrisma.leaveBalance.findMany.mockResolvedValue([]);
    mockPrisma.userRank.findMany.mockResolvedValue([
      {
        rank: {
          leaveTypeId: 5,
          maxDays: 0,
          receiveDays: 0,
          isBalance: 1
        }
      }
    ]);
    
    await resetLeaveBalance();
    
    expect(mockPrisma.leaveBalance.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 1,
        leaveTypeId: 5,
        maxDays: 0,
        remainingDays: 0,
        usedDays: 0,
        pendingDays: 0,
        year: 2025
      })
    });
  });

  test('should handle carry over calculation correctly', async () => {
    // Mock กรณี carry over วันลาพักผ่อน
    mockPrisma.leaveBalance.findMany.mockResolvedValue([]);
    mockPrisma.userRank.findMany.mockResolvedValue([
      {
        rank: {
          leaveTypeId: 4,
          maxDays: 10,
          receiveDays: 10,
          isBalance: 1
        }
      }
    ]);
    mockPrisma.leaveType.findUnique.mockImplementation((params) => {
      if (params.where.id === 4) {
        return Promise.resolve({
          id: 4,
          resetOnFiscalYear: true,
          isNonDeductible: false
        });
      }
      return Promise.resolve({
        id: params.where.id,
        resetOnFiscalYear: true,
        isNonDeductible: false
      });
    });
    mockPrisma.leaveBalance.findFirst.mockResolvedValue({
      remainingDays: 5,
      maxDays: 10,
      usedDays: 3
    });
    
    await resetLeaveBalance();
    
    expect(mockConsole.log).toHaveBeenCalledWith(
      expect.stringContaining('คำนวณ carry over สำหรับ userId 1: สิทธิ์ 5/10, ใช้ไป 3, carry over 5')
    );
  });

  });
