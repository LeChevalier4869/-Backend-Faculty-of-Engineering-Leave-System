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
    }),
    update: jest.fn().mockResolvedValue({ key: 'fiscalYear', value: '2027' }),
    upsert: jest.fn().mockResolvedValue({ key: 'lastLeaveBalanceResetYear', value: '2027' }),
  },
  leaveBalance: {
    findMany: jest.fn().mockResolvedValue([]),
    findFirst: jest.fn().mockResolvedValue(null),
    count: jest.fn().mockResolvedValue(0),
    deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    createMany: jest.fn().mockResolvedValue({ count: 0 }),
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
    createMany: jest.fn().mockResolvedValue({ count: 0 }),
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
  error: jest.fn(),
  warn: jest.fn(),
};

describe('resetLeaveBalance', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();
    mockPrisma.setting.findUnique.mockReset().mockResolvedValue({
      key: 'fiscalYear',
      value: '2025',
    });
    mockPrisma.leaveBalance.count.mockReset().mockResolvedValue(0);
    mockPrisma.rank.findMany.mockReset().mockResolvedValue([]);
    
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

  test('calculates the fiscal year using Bangkok time at the October boundary', () => {
    expect(resetFunctions.getFiscalYearForDate(new Date('2026-09-30T16:59:59.000Z'))).toBe(2026);
    expect(resetFunctions.getFiscalYearForDate(new Date('2026-09-30T17:00:00.000Z'))).toBe(2027);
    expect(resetFunctions.getFiscalYearForDate(new Date('2027-09-30T17:00:00.000Z'))).toBe(2028);
  });

  test('does not destructively reset an existing fiscal year during startup recovery', async () => {
    mockPrisma.setting.findUnique.mockImplementation(({ where }) =>
      Promise.resolve({
        key: where.key,
        value: where.key === 'fiscalYear' ? '2026' : '2026',
      })
    );
    mockPrisma.leaveBalance.count.mockResolvedValue(25);

    const result = await resetFunctions.ensureCurrentFiscalYearBalances(
      new Date('2026-11-20T10:00:00.000Z')
    );

    expect(result).toEqual({ year: 2027, resetPerformed: false });
    expect(mockPrisma.leaveBalance.deleteMany).not.toHaveBeenCalled();
    expect(mockPrisma.setting.update).toHaveBeenCalledWith({
      where: { key: 'fiscalYear' },
      data: { value: '2027' },
    });
    expect(mockPrisma.setting.upsert).not.toHaveBeenCalled();
  });

  test('creates missing fiscal-year balances when startup detects no records', async () => {
    mockPrisma.setting.findUnique.mockImplementation(({ where }) =>
      Promise.resolve({
        key: where.key,
        value: where.key === 'fiscalYear' ? '2026' : '2026',
      })
    );
    mockPrisma.leaveBalance.count.mockResolvedValue(0);

    const result = await resetFunctions.ensureCurrentFiscalYearBalances(
      new Date('2026-11-20T10:00:00.000Z')
    );

    expect(result).toEqual({ year: 2027, resetPerformed: true });
    expect(mockPrisma.leaveBalance.deleteMany).toHaveBeenCalledWith({
      where: { year: 2027, leaveTypeId: { in: [4, 6, 11] } },
    });
    expect(mockPrisma.setting.update).toHaveBeenCalledWith({
      where: { key: 'fiscalYear' },
      data: { value: '2027' },
    });
    expect(mockPrisma.setting.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { key: 'lastLeaveBalanceResetYear' },
        update: { value: '2027' },
      })
    );
  });

  test('recovers fiscal-year 2028 when the Bangkok date reaches October 1, 2027', async () => {
    mockPrisma.setting.findUnique.mockImplementation(({ where }) =>
      Promise.resolve({
        key: where.key,
        value: '2027',
      })
    );

    const result = await resetFunctions.ensureCurrentFiscalYearBalances(
      new Date('2027-09-30T17:00:00.000Z')
    );

    expect(result).toEqual({ year: 2028, resetPerformed: true });
    expect(mockPrisma.leaveBalance.deleteMany).toHaveBeenCalledWith({
      where: { year: 2028, leaveTypeId: { in: [4, 6, 11] } },
    });
    expect(mockPrisma.setting.update).toHaveBeenCalledWith({
      where: { key: 'fiscalYear' },
      data: { value: '2028' },
    });
  });

  test('should skip non-reset leave types', async () => {
    // Mock กรณีประเภทที่ไม่รีเซ็ตและไม่ใช่ non-deductible และไม่ใช่ลาพักผ่อน
    mockPrisma.leaveBalance.findMany.mockResolvedValue([]);
    mockPrisma.rank.findMany.mockResolvedValue([
      {
        id: 7,
        personnelTypeId: 1,
        minHireMonths: null,
        maxHireMonths: null,
        leaveTypeId: 7,
        maxDays: 5,
        receiveDays: 5,
        isBalance: true
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
    
    expect(mockPrisma.leaveBalance.count).toHaveBeenCalledWith({
      where: { year: 2025 }
    });
    expect(mockPrisma.rank.findMany).toHaveBeenCalled();
    expect(mockPrisma.leaveType.findMany).toHaveBeenCalled();
    expect(mockConsole.log).toHaveBeenCalledWith(
      '✅ ไม่พบข้อมูล LeaveBalance ปี 2025 จะสร้างข้อมูลใหม่'
    );
    expect(mockPrisma.userRank.deleteMany).toHaveBeenCalled();
  });

  test('should handle vacation leave without reset', async () => {
    // Mock กรณีลาพักผ่อนไม่รีเซ็ต
    mockPrisma.leaveBalance.findMany.mockResolvedValue([]);
    mockPrisma.rank.findMany.mockResolvedValue([
      {
        id: 4,
        personnelTypeId: 1,
        minHireMonths: null,
        maxHireMonths: null,
        leaveTypeId: 4,
        maxDays: 10,
        receiveDays: 10,
        isBalance: true
      }
    ]);
    
    await resetFunctions.resetLeaveBalance();
    
    expect(mockPrisma.leaveBalance.createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([expect.objectContaining({
        userId: 1,
        leaveTypeId: 4,
        maxDays: 10,
        remainingDays: 10,
        usedDays: 0,
        pendingDays: 0,
        year: 2025
      })])
    });
  });

  test('one-time non-deductible leave types: update year but copy old entitlement forward', async () => {
    // leaveTypeId 5 = non-deductible + resetOnFiscalYear=false (ลาครั้งเดียว เช่น ลาอุปสมบท)
    // ต้องสร้าง record ของปีใหม่ (year อัปเดต) แต่ copy usedDays/remaining เดิมมา ไม่รีเซ็ต
    mockPrisma.leaveBalance.findMany.mockResolvedValue([]);
    mockPrisma.rank.findMany.mockResolvedValue([
      {
        id: 5,
        personnelTypeId: 1,
        minHireMonths: null,
        maxHireMonths: null,
        leaveTypeId: 5,
        maxDays: 0,
        receiveDays: 0,
        isBalance: true
      }
    ]);

    // ยอดเดิมของปีก่อน (มี usedDays=7)
    mockPrisma.leaveBalance.findFirst.mockImplementation(({ where }) => {
      if (
        where.leaveTypeId === 5 &&
        typeof where.year === 'object' &&
        where.year.lt === 2025
      ) {
        return Promise.resolve({
          maxDays: 0,
          usedDays: 7,
          remainingDays: 3,
          pendingDays: 0,
          year: 2024,
        });
      }
      return Promise.resolve(null);
    });

    await resetFunctions.resetLeaveBalance();

    // สร้าง record ปีใหม่ (2025) โดย copy ยอดเดิม (usedDays=7) ไม่รีเซ็ตเป็น 0
    expect(mockPrisma.leaveBalance.createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([expect.objectContaining({
        userId: 1,
        leaveTypeId: 5,
        maxDays: 0,
        usedDays: 7,
        remainingDays: 3,
        year: 2025,
      })])
    });
  });

  test('preserves existing current-year balances for leave types configured not to reset', async () => {
    mockPrisma.rank.findMany.mockResolvedValue([
      {
        id: 5,
        personnelTypeId: 1,
        minHireMonths: null,
        maxHireMonths: null,
        leaveTypeId: 5,
        maxDays: 0,
        receiveDays: 0,
        isBalance: true
      }
    ]);
    mockPrisma.leaveBalance.findMany.mockResolvedValue([
      { userId: 1, leaveTypeId: 5 }
    ]);

    await resetFunctions.resetLeaveBalance();

    const deleteWhere = mockPrisma.leaveBalance.deleteMany.mock.calls[0][0].where;
    expect(deleteWhere.year).toBe(2025);
    expect(deleteWhere.leaveTypeId.in).not.toContain(5);
    expect(deleteWhere.leaveTypeId.in).not.toContain(10);
    expect(deleteWhere.leaveTypeId.in).not.toContain(13);
    expect(mockPrisma.leaveBalance.createMany).not.toHaveBeenCalled();
    expect(mockPrisma.leaveBalance.findFirst).not.toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ userId: 1, leaveTypeId: 5 })
      })
    );
  });

  test('copies selected users balances from a source fiscal year without recalculating them', async () => {
    mockPrisma.leaveBalance.findMany.mockImplementation(({ where }) =>
      Promise.resolve(
        where.year === 2026
          ? [
              {
                userId: 1,
                leaveTypeId: 13,
                maxDays: 0,
                usedDays: 5,
                pendingDays: 0,
                remainingDays: 0,
              },
            ]
          : []
      )
    );

    await resetFunctions.resetLeaveBalance(2027, {
      copyBalancesFromYearForUsers: { year: 2026, userIds: [1] },
    });

    expect(mockPrisma.leaveBalance.deleteMany).toHaveBeenCalledWith({
      where: { year: 2027, userId: { in: [1] } },
    });
    expect(mockPrisma.leaveBalance.createMany).toHaveBeenCalledWith({
      data: [
        {
          userId: 1,
          leaveTypeId: 13,
          maxDays: 0,
          usedDays: 5,
          pendingDays: 0,
          remainingDays: 0,
          year: 2027,
        },
      ],
    });
  });

  test('should handle non-deductible leave types that reset annually', async () => {
    // Mock กรณีประเภทไม่ต้องหักวันที่รีเซ็ตปีใหม่ (เช่น LeaveType 6, 11)
    mockPrisma.leaveBalance.findMany.mockResolvedValue([]);
    mockPrisma.rank.findMany.mockResolvedValue([
      {
        id: 6,
        personnelTypeId: 1,
        minHireMonths: null,
        maxHireMonths: null,
        leaveTypeId: 6,
        maxDays: 0,
        receiveDays: 0,
        isBalance: false
      }
    ]);
    
    await resetFunctions.resetLeaveBalance();
    
    expect(mockPrisma.leaveBalance.createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([expect.objectContaining({
        userId: 1,
        leaveTypeId: 6,
        maxDays: 0,
        remainingDays: 0,
        usedDays: 0,
        pendingDays: 0,
        year: 2025
      })])
    });
  });

  test('should handle carry over calculation correctly', async () => {
    // Mock กรณี carry over วันลาพักผ่อน
    mockPrisma.leaveBalance.findMany.mockResolvedValue([]);
    mockPrisma.rank.findMany.mockResolvedValue([
      {
        id: 4,
        personnelTypeId: 1,
        minHireMonths: null,
        maxHireMonths: null,
        leaveTypeId: 4,
        maxDays: 10,
        receiveDays: 10,
        isBalance: true
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
    
    expect(mockPrisma.leaveBalance.createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({
          userId: 1,
          leaveTypeId: 4,
          remainingDays: 15,
        }),
      ]),
    });
  });
});
