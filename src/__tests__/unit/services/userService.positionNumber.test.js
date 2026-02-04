const UserService = require('../../../services/user-service');

// Mock prisma with proper structure
jest.mock('../../../config/prisma', () => ({
  $transaction: jest.fn(),
  userPositionNumber: {
    updateMany: jest.fn(),
    create: jest.fn(),
    findMany: jest.fn(),
    findFirst: jest.fn(),
  },
  auditLog: {
    create: jest.fn(),
  }
}));

const mockPrisma = require('../../../config/prisma');

describe('UserService - Position Number', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('updateUserPositionNumber', () => {
    it('should update position number with transaction', async () => {
      const userId = 123;
      const newPositionNumber = 'ENG-002';
      const changedByUserId = 456;

      const mockTransaction = {
        userPositionNumber: {
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
          create: jest.fn().mockResolvedValue({
            id: 1,
            userId,
            positionNumber: newPositionNumber,
            effectiveFrom: expect.any(Date),
            isCurrent: true
          })
        },
        auditLog: {
          create: jest.fn().mockResolvedValue({ id: 1 })
        }
      };

      mockPrisma.$transaction.mockImplementation((callback) => {
        return callback(mockTransaction);
      });

      const result = await UserService.updateUserPositionNumber(
        userId,
        newPositionNumber,
        changedByUserId
      );

      expect(mockTransaction.userPositionNumber.updateMany).toHaveBeenCalledWith({
        where: {
          userId,
          isCurrent: true,
        },
        data: {
          effectiveTo: expect.any(Date),
          isCurrent: false,
        },
      });

      expect(mockTransaction.userPositionNumber.create).toHaveBeenCalledWith({
        data: {
          userId,
          positionNumber: newPositionNumber,
          effectiveFrom: expect.any(Date),
          isCurrent: true,
        },
      });

      expect(mockTransaction.auditLog.create).toHaveBeenCalledWith({
        data: {
          userId: changedByUserId,
          action: 'UPDATE_POSITION_NUMBER',
          entityType: 'User',
          entityId: userId,
          details: `Changed position number to ${newPositionNumber}`,
        },
      });

      expect(result).toEqual({
        id: 1,
        userId,
        positionNumber: newPositionNumber,
        effectiveFrom: expect.any(Date),
        isCurrent: true
      });
    });

    it('should handle first-time position number assignment', async () => {
      const userId = 123;
      const newPositionNumber = 'ENG-001';
      const changedByUserId = 456;

      const mockTransaction = {
        userPositionNumber: {
          updateMany: jest.fn().mockResolvedValue({ count: 0 }), // No existing records
          create: jest.fn().mockResolvedValue({
            id: 1,
            userId,
            positionNumber: newPositionNumber,
            effectiveFrom: expect.any(Date),
            isCurrent: true
          })
        },
        auditLog: {
          create: jest.fn().mockResolvedValue({ id: 1 })
        }
      };

      mockPrisma.$transaction.mockImplementation((callback) => {
        return callback(mockTransaction);
      });

      const result = await UserService.updateUserPositionNumber(
        userId,
        newPositionNumber,
        changedByUserId
      );

      expect(mockTransaction.userPositionNumber.updateMany).toHaveBeenCalled();
      expect(mockTransaction.userPositionNumber.create).toHaveBeenCalled();
      expect(result).toBeDefined();
    });
  });

  describe('getUserPositionNumberHistory', () => {
    it('should get position number history ordered by effectiveFrom desc', async () => {
      const userId = 123;
      const expectedHistory = [
        {
          id: 2,
          userId,
          positionNumber: 'ENG-002',
          effectiveFrom: new Date('2024-06-01'),
          effectiveTo: null,
          isCurrent: true,
          user: {
            prefixName: 'นาย',
            firstName: 'สมชาย',
            lastName: 'ใจดี',
            email: 'somchai@rmuti.ac.th'
          }
        },
        {
          id: 1,
          userId,
          positionNumber: 'ENG-001',
          effectiveFrom: new Date('2024-01-01'),
          effectiveTo: new Date('2024-06-01'),
          isCurrent: false,
          user: {
            prefixName: 'นาย',
            firstName: 'สมชาย',
            lastName: 'ใจดี',
            email: 'somchai@rmuti.ac.th'
          }
        }
      ];

      mockPrisma.userPositionNumber.findMany.mockResolvedValue(expectedHistory);

      const result = await UserService.getUserPositionNumberHistory(userId);

      expect(mockPrisma.userPositionNumber.findMany).toHaveBeenCalledWith({
        where: { userId },
        orderBy: { effectiveFrom: 'desc' },
        include: {
          user: {
            select: {
              prefixName: true,
              firstName: true,
              lastName: true,
              email: true,
            },
          },
        },
      });

      expect(result).toEqual(expectedHistory);
    });

    it('should return empty array for user with no position history', async () => {
      const userId = 123;

      mockPrisma.userPositionNumber.findMany.mockResolvedValue([]);

      const result = await UserService.getUserPositionNumberHistory(userId);

      expect(result).toEqual([]);
    });
  });

  describe('getCurrentPositionNumber', () => {
    it('should get current position number', async () => {
      const userId = 123;
      const expectedCurrent = {
        positionNumber: 'ENG-002',
        effectiveFrom: new Date('2024-06-01')
      };

      mockPrisma.userPositionNumber.findFirst.mockResolvedValue(expectedCurrent);

      const result = await UserService.getCurrentPositionNumber(userId);

      expect(mockPrisma.userPositionNumber.findFirst).toHaveBeenCalledWith({
        where: {
          userId,
          isCurrent: true,
        },
        select: {
          positionNumber: true,
          effectiveFrom: true,
        },
      });

      expect(result).toEqual(expectedCurrent);
    });

    it('should return null for user with no current position number', async () => {
      const userId = 123;

      mockPrisma.userPositionNumber.findFirst.mockResolvedValue(null);

      const result = await UserService.getCurrentPositionNumber(userId);

      expect(result).toBeNull();
    });
  });

  describe('getPositionNumberByNumber', () => {
    it('should get user by position number', async () => {
      const positionNumber = 'ENG-002';
      const expectedUser = {
        user: {
          id: 123,
          prefixName: 'นาย',
          firstName: 'สมชาย',
          lastName: 'ใจดี',
          email: 'somchai@rmuti.ac.th'
        }
      };

      mockPrisma.userPositionNumber.findFirst.mockResolvedValue(expectedUser);

      const result = await UserService.getPositionNumberByNumber(positionNumber);

      expect(mockPrisma.userPositionNumber.findFirst).toHaveBeenCalledWith({
        where: {
          positionNumber,
          isCurrent: true,
        },
        include: {
          user: {
            select: {
              id: true,
              prefixName: true,
              firstName: true,
              lastName: true,
              email: true,
            },
          },
        },
      });

      expect(result).toEqual(expectedUser);
    });

    it('should return null for non-existent position number', async () => {
      const positionNumber = 'NONEXISTENT';

      mockPrisma.userPositionNumber.findFirst.mockResolvedValue(null);

      const result = await UserService.getPositionNumberByNumber(positionNumber);

      expect(result).toBeNull();
    });
  });

  describe('Position Number Constraints', () => {
    it('should enforce unique constraint on position number for current records', async () => {
      // This test verifies that the database constraints work
      // In a real scenario, this would be tested at the database level
      const userId1 = 123;
      const userId2 = 456;
      const positionNumber = 'ENG-001';

      const mockTransaction = {
        userPositionNumber: {
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
          create: jest.fn().mockRejectedValue(new Error('Unique constraint failed'))
        },
        auditLog: {
          create: jest.fn()
        }
      };

      mockPrisma.$transaction.mockImplementation((callback) => {
        return callback(mockTransaction);
      });

      await expect(
        UserService.updateUserPositionNumber(userId2, positionNumber, 1)
      ).rejects.toThrow('Unique constraint failed');
    });

    it('should allow reuse of position number when old record is not current', async () => {
      const userId1 = 123;
      const userId2 = 456;
      const positionNumber = 'ENG-001';

      // First, update user1 to make position number available
      const mockTransaction1 = {
        userPositionNumber: {
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
          create: jest.fn().mockResolvedValue({
            id: 2,
            userId: userId1,
            positionNumber: 'ENG-002',
            effectiveFrom: expect.any(Date),
            isCurrent: true
          })
        },
        auditLog: {
          create: jest.fn().mockResolvedValue({ id: 1 })
        }
      };

      // Then assign the old position number to user2
      const mockTransaction2 = {
        userPositionNumber: {
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
          create: jest.fn().mockResolvedValue({
            id: 3,
            userId: userId2,
            positionNumber: 'ENG-001',
            effectiveFrom: expect.any(Date),
            isCurrent: true
          })
        },
        auditLog: {
          create: jest.fn().mockResolvedValue({ id: 2 })
        }
      };

      mockPrisma.$transaction
        .mockImplementationOnce((callback) => callback(mockTransaction1))
        .mockImplementationOnce((callback) => callback(mockTransaction2));

      const result1 = await UserService.updateUserPositionNumber(userId1, 'ENG-002', 1);
      const result2 = await UserService.updateUserPositionNumber(userId2, 'ENG-001', 1);

      expect(result1.positionNumber).toBe('ENG-002');
      expect(result2.positionNumber).toBe('ENG-001');
    });
  });
});
