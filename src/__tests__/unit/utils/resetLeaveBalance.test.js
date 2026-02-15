// Mock Prisma
const mockPrisma = {
  $transaction: jest.fn().mockImplementation((callback) => {
    // Mock transaction - just call the callback with mock tx
    const mockTx = {
      rank: mockPrisma.rank,
      userRank: mockPrisma.userRank,
      leaveBalance: mockPrisma.leaveBalance,
      leaveType: mockPrisma.leaveType,
      user: mockPrisma.user,
      setting: mockPrisma.setting,
    };
    return callback(mockTx);
  }),
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
  rank: {
    findMany: jest.fn().mockResolvedValue([])
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
    findMany: jest.fn().mockResolvedValue([
      { id: 4, resetOnFiscalYear: true, isNonDeductible: false }, // เปลี่ยนเป็น true
      { id: 5, resetOnFiscalYear: false, isNonDeductible: true },
      { id: 6, resetOnFiscalYear: true, isNonDeductible: true },
      { id: 7, resetOnFiscalYear: false, isNonDeductible: false },
      { id: 10, resetOnFiscalYear: false, isNonDeductible: true },
      { id: 11, resetOnFiscalYear: true, isNonDeductible: true },
      { id: 13, resetOnFiscalYear: false, isNonDeductible: true }
    ]),
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
      } else if (params.where.id === 6) {
        return Promise.resolve({
          id: 6,
          resetOnFiscalYear: true, // รีเซ็ตปีใหม่
          isNonDeductible: true
        });
      } else if (params.where.id === 7) {
        return Promise.resolve({
          id: 7,
          resetOnFiscalYear: false,
          isNonDeductible: false
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
  let resetFunctions;
  beforeEach(() => {
    resetFunctions = require('../../../utils/resetLeaveBalance');
  });

  test('should skip non-reset leave types', async () => {
    // Mock กรณีประเภทที่ไม่รีเซ็ตและไม่ใช่ non-deductible และไม่ใช่ลาพักผ่อน
    mockPrisma.leaveBalance.findMany.mockResolvedValue([]);
    mockPrisma.userRank.findMany.mockResolvedValue([
      {
        rank: {
          leaveTypeId: 7, // สมมติว่าเป็นประเภทที่ไม่รีเซ็ตและต้องหักวัน
          maxDays: 5,
          receiveDays: 5,
          isBalance: true
        }
      }
    ]);
    
    await resetFunctions.resetLeaveBalance();
    
    expect(mockConsole.log).toHaveBeenCalledWith(
      '⏭️ ข้าม LeaveType 7 (ไม่รีเซ็ตปีใหม่)'
    );
  });

  test('should handle empty current balances', async () => {
    // Mock กรณีไม่มี balance ปีปัจจุบัน
    mockPrisma.leaveBalance.findMany.mockResolvedValue([]);
    
    await resetFunctions.resetLeaveBalance();
    
    expect(mockPrisma.leaveBalance.findMany).toHaveBeenCalledWith({
      where: { year: 2025 }
    });
    expect(mockPrisma.rank.findMany).toHaveBeenCalled();
    expect(mockPrisma.leaveType.findMany).toHaveBeenCalled();
    expect(mockConsole.log).toHaveBeenCalledWith(
      '✅ ไม่พบข้อมูล LeaveBalance ปี 2025 จะสร้างข้อมูลใหม่'
    );
    expect(mockConsole.log).toHaveBeenCalledWith('🧹 ลบข้อมูล user_Rank เรียบร้อย (เพื่อสร้างใหม่ตามอาวุโส)');
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
          isBalance: true
        }
      }
    ]);
    
    await resetFunctions.resetLeaveBalance();
    
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
      expect.stringContaining('💰 ลาพักผ่อน userId 1: ใหม่ 10 + carryOver 0 = 10')
    );
  });

  test('should handle non-deductible leave types', async () => {
    // Mock กรณีประเภทไม่ต้องหักวันที่มี isBalance: true
    mockPrisma.leaveBalance.findMany.mockResolvedValue([]);
    mockPrisma.userRank.findMany.mockResolvedValue([
      {
        rank: {
          leaveTypeId: 5,
          maxDays: 0,
          receiveDays: 0,
          isBalance: true
        }
      }
    ]);
    
    await resetFunctions.resetLeaveBalance();
    
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

  test('should handle non-deductible leave types that reset annually', async () => {
    // Mock กรณีประเภทไม่ต้องหักวันที่รีเซ็ตปีใหม่ (เช่น LeaveType 6, 11)
    mockPrisma.leaveBalance.findMany.mockResolvedValue([]);
    mockPrisma.userRank.findMany.mockResolvedValue([
      {
        rank: {
          leaveTypeId: 6,
          maxDays: 0,
          receiveDays: 0,
          isBalance: false
        }
      }
    ]);
    
    await resetFunctions.resetLeaveBalance();
    
    expect(mockPrisma.leaveBalance.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 1,
        leaveTypeId: 6,
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
          isBalance: true
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
    
    await resetFunctions.resetLeaveBalance();
    
    expect(mockConsole.log).toHaveBeenCalledWith(
      expect.stringContaining('คำนวณ carry over สำหรับ userId 1: สิทธิ์ 5/10, ใช้ไป 3, carry over 5')
    );
  });
});
