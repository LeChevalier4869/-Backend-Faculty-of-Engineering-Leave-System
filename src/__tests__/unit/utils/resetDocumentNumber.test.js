// Mock Prisma
const mockPrisma = {
  setting: {
    findUnique: jest.fn(),
    update: jest.fn()
  }
};

// Mock AuditLogService
const mockAuditLogService = {
  createLog: jest.fn().mockResolvedValue({ id: 1 })
};

describe('resetDocumentNumber', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();
    
    // Mock require
    jest.doMock('../../../config/prisma', () => mockPrisma);
    jest.doMock('../../../services/auditLog-service', () => mockAuditLogService);
    
    // Mock console
    global.console = {
      log: jest.fn(),
      error: jest.fn()
    };
  });

  // Require the module after mocks are set up
  let resetFunctions;
  beforeEach(() => {
    resetFunctions = require('../../../utils/resetLeaveBalance');
  });

  test('should reset document number successfully', async () => {
    // Mock current setting
    mockPrisma.setting.findUnique.mockResolvedValue({
      id: 1,
      key: 'runNumber',
      value: 'คว.0156/68'
    });

    // Mock update
    mockPrisma.setting.update.mockResolvedValue({
      id: 1,
      key: 'runNumber',
      value: 'คว.0001/69'
    });

    const result = await resetFunctions.resetDocumentNumber(2026);

    expect(mockPrisma.setting.findUnique).toHaveBeenCalledWith({
      where: { key: 'runNumber' }
    });

    expect(mockPrisma.setting.update).toHaveBeenCalledWith({
      where: { key: 'runNumber' },
      data: { value: 'คว.0001/69' }
    });

    expect(mockAuditLogService.createLog).toHaveBeenCalledWith(
      null,
      'DOCUMENT_NUMBER_RESET_START',
      'SYSTEM',
      null,
      'เริ่มรีเซ็ต Document Number: คว.0156/68 → คว.0001/69',
      null,
      'SYSTEM_CRON',
      {
        oldValue: 'คว.0156/68',
        newValue: 'คว.0001/69',
        fiscalYear: 2026,
        buddhistYear: 2569
      }
    );

    expect(mockAuditLogService.createLog).toHaveBeenCalledWith(
      null,
      'DOCUMENT_NUMBER_RESET_SUCCESS',
      'SYSTEM',
      null,
      'รีเซ็ต Document Number สำเร็จ: คว.0001/69',
      null,
      'SYSTEM_CRON',
      {
        oldValue: 'คว.0156/68',
        newValue: 'คว.0001/69',
        fiscalYear: 2026,
        buddhistYear: 2569
      }
    );

    expect(result).toBe('คว.0001/69');
  });

  test('should handle missing runNumber setting', async () => {
    // Mock missing setting
    mockPrisma.setting.findUnique.mockResolvedValue(null);

    await expect(resetFunctions.resetDocumentNumber(2026)).rejects.toThrow('ไม่พบ setting: runNumber');

    expect(mockAuditLogService.createLog).toHaveBeenCalledWith(
      null,
      'DOCUMENT_NUMBER_RESET_ERROR',
      'SYSTEM',
      null,
      'รีเซ็ต Document Number ผิดพลาด: ไม่พบ setting: runNumber',
      null,
      'SYSTEM_CRON',
      {
        error: 'ไม่พบ setting: runNumber',
        fiscalYear: 2026
      }
    );
  });

  test('should handle database error', async () => {
    // Mock database error
    mockPrisma.setting.findUnique.mockRejectedValue(new Error('Database connection failed'));

    await expect(resetFunctions.resetDocumentNumber(2026)).rejects.toThrow('Database connection failed');

    expect(mockAuditLogService.createLog).toHaveBeenCalledWith(
      null,
      'DOCUMENT_NUMBER_RESET_ERROR',
      'SYSTEM',
      null,
      'รีเซ็ต Document Number ผิดพลาด: Database connection failed',
      null,
      'SYSTEM_CRON',
      {
        error: 'Database connection failed',
        fiscalYear: 2026
      }
    );
  });

  test('should format year suffix correctly', async () => {
    mockPrisma.setting.findUnique.mockResolvedValue({
      id: 1,
      key: 'runNumber',
      value: 'คว.0999/68'
    });

    mockPrisma.setting.update.mockResolvedValue({
      id: 1,
      key: 'runNumber',
      value: 'คว.0001/70' // 2030 -> 2573 -> "73" แก้เป็น 70
    });

    const result = await resetFunctions.resetDocumentNumber(2027); // 2027 + 543 = 2570 -> "70"

    expect(result).toBe('คว.0001/70');
  });
});
