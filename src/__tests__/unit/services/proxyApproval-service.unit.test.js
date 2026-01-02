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
      };

      const mockOriginalApprover = { id: 1, firstName: "John", lastName: "Doe" };
      const mockProxyApprover = { id: 2, firstName: "Jane", lastName: "Smith" };
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
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(
        ProxyApprovalService.createProxyApproval({
          originalApproverId: 999,
          proxyApproverId: 2,
          approverLevel: 1,
          startDate: "2024-01-01",
          endDate: "2024-01-31",
        })
      ).rejects.toThrow("ไม่พบข้อมูลผู้อนุมัติต้นฉบับ");
    });

    it("should throw error when proxy approver not found", async () => {
      prisma.user.findUnique
        .mockResolvedValueOnce({ id: 1 })
        .mockResolvedValueOnce(null);

      await expect(
        ProxyApprovalService.createProxyApproval({
          originalApproverId: 1,
          proxyApproverId: 999,
          approverLevel: 1,
          startDate: "2024-01-01",
          endDate: "2024-01-31",
        })
      ).rejects.toThrow("ไม่พบข้อมูลผู้อนุมัติแทน");
    });

    it("should throw error when same user is assigned as proxy", async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 1 });

      await expect(
        ProxyApprovalService.createProxyApproval({
          originalApproverId: 1,
          proxyApproverId: 1,
          approverLevel: 1,
          startDate: "2024-01-01",
          endDate: "2024-01-31",
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
        startDate: new Date("2024-01-01"),
        endDate: new Date("2024-01-31"),
      };

      prisma.proxyApproval.findFirst.mockResolvedValue(mockProxy);

      const result = await ProxyApprovalService.getActiveProxyApproval(1, 1, new Date("2024-01-15"));

      expect(prisma.proxyApproval.findFirst).toHaveBeenCalledWith({
        where: {
          originalApproverId: 1,
          approverLevel: 1,
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
      prisma.proxyApproval.findFirst.mockResolvedValue(null);

      const result = await ProxyApprovalService.getActiveProxyApproval(1, 1);

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
      };

      // Mock getActiveProxyApproval to return proxy
      jest.spyOn(ProxyApprovalService, "getActiveProxyApproval").mockResolvedValue(mockProxy);

      const result = await ProxyApprovalService.canUserApprove(2, 1);

      expect(result).toEqual({
        canApprove: true,
        isProxy: true,
        proxyApproval: mockProxy,
        originalApproverId: 1,
      });
    });

    it("should check original approver permissions when no proxy found", async () => {
      // Mock getActiveProxyApproval to return null
      jest.spyOn(ProxyApprovalService, "getActiveProxyApproval").mockResolvedValue(null);

      // Mock department check for approver level 1
      prisma.department.findFirst.mockResolvedValue({ id: 1, headId: 1 });

      const result = await ProxyApprovalService.canUserApprove(1, 1);

      expect(result).toEqual({
        canApprove: true,
        isProxy: false,
        proxyApproval: null,
        originalApproverId: null,
      });
    });

    it("should return false when user cannot approve", async () => {
      // Mock getActiveProxyApproval to return null
      jest.spyOn(ProxyApprovalService, "getActiveProxyApproval").mockResolvedValue(null);

      // Mock department check to return null (not a department head)
      prisma.department.findFirst.mockResolvedValue(null);

      const result = await ProxyApprovalService.canUserApprove(999, 1);

      expect(result).toEqual({
        canApprove: false,
        isProxy: false,
        proxyApproval: null,
        originalApproverId: null,
      });
    });
  });

  describe("getPotentialApprovers", () => {
    it("should get potential approvers for level 1", async () => {
      const mockApprovers = [
        { id: 1, firstName: "John", lastName: "Doe", department: { id: 1, name: "IT" } },
        { id: 2, firstName: "Jane", lastName: "Smith", department: { id: 2, name: "HR" } },
      ];

      prisma.user.findMany.mockResolvedValue(mockApprovers);

      const result = await ProxyApprovalService.getPotentialApprovers(1);

      expect(prisma.user.findMany).toHaveBeenCalledWith({
        where: {
          department: {
            headId: { not: null },
          },
        },
        include: {
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
          firstName: "John",
          lastName: "Doe",
          department: { id: 1, name: "IT" },
        },
        {
          id: 2,
          firstName: "Jane",
          lastName: "Smith",
          department: { id: 2, name: "HR" },
        },
      ]);
    });

    it("should get potential approvers for level 2 (verifier)", async () => {
      const mockApprovers = [
        { id: 1, firstName: "John", lastName: "Doe" },
        { id: 2, firstName: "Jane", lastName: "Smith" },
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
      });
      expect(result).toEqual([
        { id: 1, firstName: "John", lastName: "Doe" },
        { id: 2, firstName: "Jane", lastName: "Smith" },
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
      const mockResult = { count: 5 };

      prisma.proxyApproval.updateMany.mockResolvedValue(mockResult);

      const result = await ProxyApprovalService.expireProxyApprovals();

      expect(prisma.proxyApproval.updateMany).toHaveBeenCalledWith({
        where: {
          status: "ACTIVE",
          endDate: { lt: expect.any(Date) },
        },
        data: {
          status: "EXPIRED",
          updatedAt: expect.any(Date),
        },
      });
      expect(result).toEqual(mockResult);
    });
  });
});
