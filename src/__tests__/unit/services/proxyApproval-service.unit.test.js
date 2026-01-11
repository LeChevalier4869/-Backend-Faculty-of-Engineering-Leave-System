jest.mock("../../../config/prisma");
jest.mock("../../../utils/createError");
jest.mock("../../../services/user-service");
jest.mock("../../../services/auditLog-service");

const prisma = require("../../../config/prisma");
const createError = require("../../../utils/createError");
const UserService = require("../../../services/user-service");
const AuditLogService = require("../../../services/auditLog-service");
const ProxyApprovalService = require("../../../services/proxyApproval-service");

describe("ProxyApprovalService", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Mock createError
    createError.mockImplementation((statusCode, message) => {
      const error = new Error(message);
      error.statusCode = statusCode;
      return error;
    });
    
    // Setup complete prisma mock
    prisma.user = {
      findUnique: jest.fn(),
      findMany: jest.fn(),
    };
    
    prisma.proxyApproval = {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      deleteMany: jest.fn(),
    };
    
    prisma.department = {
      findFirst: jest.fn(),
    };
    
    prisma.userRole = {
      findFirst: jest.fn(),
    };
  });

  describe("createProxyApproval", () => {
    it("should create proxy approval successfully", async () => {
      const mockData = {
        originalApproverId: 1,
        proxyApproverId: 2,
        approverLevel: 1,
        startDate: "2024-01-01",
        endDate: "2024-01-31",
        reason: "Test reason",
        isDaily: false,
        dailyDate: null,
      };

      const mockOriginalApprover = { id: 1, firstName: "John", lastName: "Doe" };
      const mockProxyApprover = { 
        id: 2, 
        firstName: "Jane", 
        lastName: "Smith",
        userRoles: [
          {
            role: {
              name: 'APPROVER_1'
            }
          }
        ]
      };
      const mockCreatedProxy = {
        id: 1,
        ...mockData,
        originalApprover: mockOriginalApprover,
        proxyApprover: mockProxyApprover,
      };

      prisma.user.findUnique
        .mockResolvedValueOnce(mockOriginalApprover)
        .mockResolvedValueOnce(mockProxyApprover);
      prisma.proxyApproval.findFirst.mockResolvedValue(null);
      prisma.proxyApproval.create.mockResolvedValue(mockCreatedProxy);

      const result = await ProxyApprovalService.createProxyApproval(mockData);

      expect(prisma.user.findUnique).toHaveBeenCalledTimes(2);
      expect(prisma.proxyApproval.findFirst).toHaveBeenCalled();
      expect(prisma.proxyApproval.create).toHaveBeenCalledWith({
        data: {
          originalApproverId: 1,
          proxyApproverId: 2,
          approverLevel: 1,
          startDate: expect.any(Date),
          endDate: expect.any(Date),
          reason: "Test reason",
          status: "ACTIVE",
          isDaily: false,
          dailyDate: null,
        },
        include: {
          originalApprover: {
            select: {
              id: true,
              prefixName: true,
              firstName: true,
              lastName: true,
              email: true,
            },
          },
          proxyApprover: {
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
      expect(result).toEqual(mockCreatedProxy);
    });

    it("should throw error when original approver not found", async () => {
      // Setup mock to pass validation but fail user check
      prisma.user.findUnique.mockResolvedValueOnce(null); // Original approver not found
      prisma.user.findUnique.mockResolvedValueOnce({ id: 2 }); // Proxy approver found

      await expect(
        ProxyApprovalService.createProxyApproval({
          originalApproverId: 999,
          proxyApproverId: 2,
          approverLevel: 1,
          startDate: "2024-01-01",
          endDate: "2024-01-31",
          isDaily: false,
          dailyDate: null,
        })
      ).rejects.toThrow("ไม่พบข้อมูลผู้อนุมัติต้นฉบับ");
    });

    it("should throw error when proxy approver not found", async () => {
      // Setup mock to pass validation but fail user check
      prisma.user.findUnique.mockResolvedValueOnce({ id: 1 }); // Original approver found
      prisma.user.findUnique.mockResolvedValueOnce(null); // Proxy approver not found

      await expect(
        ProxyApprovalService.createProxyApproval({
          originalApproverId: 1,
          proxyApproverId: 999,
          approverLevel: 1,
          startDate: "2024-01-01",
          endDate: "2024-01-31",
          isDaily: false,
          dailyDate: null,
        })
      ).rejects.toThrow("ไม่พบข้อมูลผู้อนุมัติแทน");
    });

    it("should throw error when same user is assigned as proxy", async () => {
      // Validation happens before user checks, so we don't need to mock user.findUnique
      await expect(
        ProxyApprovalService.createProxyApproval({
          originalApproverId: 1,
          proxyApproverId: 1,
          approverLevel: 1,
          startDate: "2024-01-01",
          endDate: "2024-01-31",
          isDaily: false,
          dailyDate: null,
        })
      ).rejects.toThrow("ไม่สามารถมอบอำนาจให้ตนเองได้");
    });
  });

  describe("getActiveProxyApproval", () => {
    it("should get active proxy approval", async () => {
      const mockProxy = {
        id: 1,
        originalApproverId: 1,
        proxyApproverId: 2,
        approverLevel: 1,
        status: "ACTIVE",
        isDaily: false,
        dailyDate: null,
        startDate: new Date("2024-01-01"),
        endDate: new Date("2024-01-31"),
      };

      // Mock daily proxy check to return null first
      prisma.proxyApproval.findFirst
        .mockResolvedValueOnce(null) // Daily proxy check
        .mockResolvedValueOnce(mockProxy); // Period proxy check

      const result = await ProxyApprovalService.getActiveProxyApproval(1, 1, new Date("2024-01-15"));

      expect(prisma.proxyApproval.findFirst).toHaveBeenCalledTimes(2);
      expect(prisma.proxyApproval.findFirst).toHaveBeenNthCalledWith(1, {
        where: {
          originalApproverId: 1,
          approverLevel: 1,
          isDaily: true,
          dailyDate: expect.any(Date), // Date will be normalized to 00:00:00
          status: "ACTIVE",
        },
        include: {
          originalApprover: {
            select: {
              id: true,
              prefixName: true,
              firstName: true,
              lastName: true,
              email: true,
            },
          },
          proxyApprover: {
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
      expect(prisma.proxyApproval.findFirst).toHaveBeenNthCalledWith(2, {
        where: {
          originalApproverId: 1,
          approverLevel: 1,
          isDaily: false,
          status: "ACTIVE",
          startDate: { lte: expect.any(Date) },
          endDate: { gte: expect.any(Date) },
        },
        include: {
          originalApprover: {
            select: {
              id: true,
              prefixName: true,
              firstName: true,
              lastName: true,
              email: true,
            },
          },
          proxyApprover: {
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
      expect(result).toEqual(mockProxy);
    });

    it("should return null when no active proxy found", async () => {
      // Mock both daily and period proxy checks to return null
      prisma.proxyApproval.findFirst
        .mockResolvedValueOnce(null) // Daily proxy check
        .mockResolvedValueOnce(null); // Period proxy check

      const result = await ProxyApprovalService.getActiveProxyApproval(1, 1);

      expect(prisma.proxyApproval.findFirst).toHaveBeenCalledTimes(2);
      expect(result).toBeNull();
    });
  });

  describe("canUserApprove", () => {
    it("should return proxy approval when user is proxy approver", async () => {
      const mockProxy = {
        id: 1,
        originalApproverId: 1,
        proxyApproverId: 2,
        approverLevel: 1,
        status: "ACTIVE",
        isDaily: false,
        dailyDate: null,
      };

      // Mock getActiveProxyApproval to return proxy
      jest.spyOn(ProxyApprovalService, "getActiveProxyApproval").mockResolvedValue(mockProxy);

      const result = await ProxyApprovalService.canUserApprove(2, 1);

      expect(result).toEqual({
        canApprove: true,
        isProxy: true,
        proxyApproval: mockProxy,
        originalApproverId: 1,
        isDaily: false,
        proxyType: 'period',
      });
    });

    it("should check original approver permissions when no proxy found", async () => {
      // Mock getActiveProxyApproval to return null
      jest.spyOn(ProxyApprovalService, "getActiveProxyApproval").mockResolvedValue(null);

      // Mock userRole check for approver level 1
      prisma.userRole.findFirst.mockResolvedValue({
        userId: 1,
        role: { name: "APPROVER_1" }
      });

      const result = await ProxyApprovalService.canUserApprove(1, 1);

      expect(result).toEqual({
        canApprove: true,
        isProxy: false,
        proxyApproval: null,
        originalApproverId: null,
        isDaily: false,
        proxyType: null,
      });
    });

    it("should return false when user cannot approve", async () => {
      // Mock getActiveProxyApproval to return null
      jest.spyOn(ProxyApprovalService, "getActiveProxyApproval").mockResolvedValue(null);

      // Mock userRole check to return null (no approver role)
      prisma.userRole.findFirst.mockResolvedValue(null);

      const result = await ProxyApprovalService.canUserApprove(999, 1);

      expect(result).toEqual({
        canApprove: false,
        isProxy: false,
        proxyApproval: null,
        originalApproverId: null,
        isDaily: false,
        proxyType: null,
      });
    });
  });

  describe("getPotentialApprovers", () => {
    it("should get potential approvers for level 1", async () => {
      const mockApprovers = [
        { id: 1, prefixName: "Mr.", firstName: "John", lastName: "Doe", email: "john@example.com", department: { id: 1, name: "IT" } },
        { id: 2, prefixName: "Ms.", firstName: "Jane", lastName: "Smith", email: "jane@example.com", department: { id: 2, name: "HR" } },
      ];

      prisma.user.findMany.mockResolvedValue(mockApprovers);

      const result = await ProxyApprovalService.getPotentialApprovers(1);

      expect(prisma.user.findMany).toHaveBeenCalledWith({
        where: {
          userRoles: {
            some: {
              role: { name: "APPROVER_1" },
            },
          },
        },
        select: {
          id: true,
          prefixName: true,
          firstName: true,
          lastName: true,
          email: true,
          department: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      });
      expect(result).toEqual([
        {
          id: 1,
          prefixName: "Mr.",
          firstName: "John",
          lastName: "Doe",
          email: "john@example.com",
          department: { id: 1, name: "IT" },
        },
        {
          id: 2,
          prefixName: "Ms.",
          firstName: "Jane",
          lastName: "Smith",
          email: "jane@example.com",
          department: { id: 2, name: "HR" },
        },
      ]);
    });

    it("should get potential approvers for level 2 (verifier)", async () => {
      const mockApprovers = [
        { id: 1, prefixName: "Mr.", firstName: "John", lastName: "Doe", email: "john@example.com" },
        { id: 2, prefixName: "Ms.", firstName: "Jane", lastName: "Smith", email: "jane@example.com" },
      ];

      prisma.user.findMany.mockResolvedValue(mockApprovers);

      const result = await ProxyApprovalService.getPotentialApprovers(2);

      expect(prisma.user.findMany).toHaveBeenCalledWith({
        where: {
          userRoles: {
            some: {
              role: { name: "VERIFIER" },
            },
          },
        },
        select: {
          id: true,
          prefixName: true,
          firstName: true,
          lastName: true,
          email: true,
          department: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      });
      expect(result).toEqual([
        { id: 1, prefixName: "Mr.", firstName: "John", lastName: "Doe", email: "john@example.com" },
        { id: 2, prefixName: "Ms.", firstName: "Jane", lastName: "Smith", email: "jane@example.com" },
      ]);
    });
  });

  describe("cancelProxyApproval", () => {
    it("should cancel proxy approval successfully", async () => {
      const mockProxy = {
        id: 1,
        originalApproverId: 1,
        proxyApproverId: 2,
        status: "ACTIVE",
      };

      prisma.proxyApproval.findUnique.mockResolvedValue(mockProxy);
      prisma.proxyApproval.update.mockResolvedValue({ ...mockProxy, status: "CANCELLED" });
      AuditLogService.createLog.mockResolvedValue({});

      const result = await ProxyApprovalService.cancelProxyApproval(1, 1);

      expect(prisma.proxyApproval.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: {
          status: "CANCELLED",
          updatedAt: expect.any(Date),
        },
        include: {
          originalApprover: {
            select: {
              id: true,
              prefixName: true,
              firstName: true,
              lastName: true,
              email: true,
            },
          },
          proxyApprover: {
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
      expect(AuditLogService.createLog).toHaveBeenCalled();
      expect(result.status).toBe("CANCELLED");
    });

    it("should throw error when proxy not found", async () => {
      prisma.proxyApproval.findUnique.mockResolvedValue(null);

      await expect(ProxyApprovalService.cancelProxyApproval(999, 1)).rejects.toThrow(
        "ไม่พบข้อมูลการมอบอำนาจ"
      );
    });

    it("should throw error when proxy is not active", async () => {
      const mockProxy = { id: 1, status: "CANCELLED" };

      prisma.proxyApproval.findUnique.mockResolvedValue(mockProxy);

      await expect(ProxyApprovalService.cancelProxyApproval(1, 1)).rejects.toThrow(
        "สามารถยกเลิกได้เฉพาะการมอบอำนาจที่ยังใช้งานอยู่เท่านั้น"
      );
    });
  });

  describe("expireProxyApprovals", () => {
    it("should expire proxy approvals", async () => {
      const mockPeriodResult = { count: 3 };
      const mockDailyResult = { count: 2 };
      const expectedFinalResult = {
        periodProxies: mockPeriodResult,
        dailyProxies: mockDailyResult,
        totalExpired: 5,
      };

      prisma.proxyApproval.updateMany
        .mockResolvedValueOnce(mockPeriodResult) // Period proxy expiration
        .mockResolvedValueOnce(mockDailyResult); // Daily proxy expiration

      const result = await ProxyApprovalService.expireProxyApprovals();

      expect(prisma.proxyApproval.updateMany).toHaveBeenCalledTimes(2);
      expect(prisma.proxyApproval.updateMany).toHaveBeenNthCalledWith(1, {
        where: {
          status: "ACTIVE",
          isDaily: false,
          endDate: { lt: expect.any(Date) },
        },
        data: {
          status: "EXPIRED",
          updatedAt: expect.any(Date),
        },
      });
      expect(prisma.proxyApproval.updateMany).toHaveBeenNthCalledWith(2, {
        where: {
          status: "ACTIVE",
          isDaily: true,
          dailyDate: { lt: expect.any(Date) },
        },
        data: {
          status: "EXPIRED",
          updatedAt: expect.any(Date),
        },
      });
      expect(result).toEqual(expectedFinalResult);
    });
  });
});
