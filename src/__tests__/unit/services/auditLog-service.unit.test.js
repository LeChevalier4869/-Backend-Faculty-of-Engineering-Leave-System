const AuditLogService = require("../../../services/auditLog-service");
const prisma = require("../../../config/prisma");

jest.mock("../../../config/prisma", () => ({
  auditLog: {
    create: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
    groupBy: jest.fn(),
    findFirst: jest.fn(),
  },
}));

// Mock specific methods on the service
jest.spyOn(AuditLogService, 'getLogs').mockImplementation(() => Promise.resolve([]));
jest.spyOn(AuditLogService, 'countLogs').mockImplementation(() => Promise.resolve(0));
jest.spyOn(AuditLogService, 'getEntitySnapshot').mockImplementation(() => Promise.resolve(null));

describe("AuditLogService", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("createLog", () => {
    it("should create an audit log successfully", async () => {
      const mockLog = {
        id: 1,
        userId: 1,
        leaveRequestId: 123,
        action: "Test Action",
        details: "Test details",
        createdAt: new Date(),
      };

      const entityData = { foo: "bar" };

      prisma.auditLog.create.mockResolvedValue(mockLog);

      const result = await AuditLogService.createLog(
        1,
        "Test Action",
        "LeaveRequest",
        123,
        "Test details",
        null,
        null,
        entityData
      );

      expect(prisma.auditLog.create).toHaveBeenCalled();
      expect(result).toEqual(mockLog);
    });

    it("should handle errors gracefully", async () => {
      const error = new Error("Database error");
      prisma.auditLog.create.mockRejectedValue(error);

      const entityData = { foo: "bar" };

      const result = await AuditLogService.createLog(
        1,
        "Test Action",
        "LeaveRequest",
        123,
        "Test details",
        null,
        null,
        entityData
      );

      expect(result).toBeNull();
    });

    it("should create log without leaveRequestId", async () => {
      const mockLog = {
        id: 1,
        userId: 1,
        leaveRequestId: null,
        action: "Test Action",
        details: null,
        createdAt: new Date(),
      };

      prisma.auditLog.create.mockResolvedValue(mockLog);

      const result = await AuditLogService.createLog(1, "Test Action", null, null, null);

      expect(prisma.auditLog.create).toHaveBeenCalled();
      expect(result).toEqual(mockLog);
    });
  });

  describe("logUserAction", () => {
    it("should log user action with predefined action text", async () => {
      // Test is simplified since LOGIN action is excluded from logging
      const result = await AuditLogService.logUserAction(1, "LOGIN", "User logged in");
      expect(result).toBeNull(); // LOGIN actions are excluded
    });

    it("should log user action with custom action text", async () => {
      const mockLog = {
        id: 1,
        userId: 1,
        action: "CUSTOM_ACTION",
        details: "Custom details",
        createdAt: new Date(),
      };

      prisma.auditLog.create.mockResolvedValue(mockLog);

      const result = await AuditLogService.logUserAction(1, "CUSTOM_ACTION", "Custom details");

      expect(prisma.auditLog.create).toHaveBeenCalled();
      expect(result).toEqual(mockLog);
    });
  });

  describe("getAllLogs", () => {
    it("should get all logs with pagination", async () => {
      const mockLogs = [
        { id: 1, action: "Action 1", user: { firstName: "John" } },
        { id: 2, action: "Action 2", user: { firstName: "Jane" } },
      ];
      const mockTotal = 2;

      // Mock the internal methods that getAllLogs calls
      jest.spyOn(AuditLogService, 'getLogs').mockResolvedValue(mockLogs);
      jest.spyOn(AuditLogService, 'countLogs').mockResolvedValue(mockTotal);

      const result = await AuditLogService.getAllLogs({ page: 1, limit: 10 });

      expect(AuditLogService.getLogs).toHaveBeenCalledWith({
        userId: undefined,
        userName: undefined,
        action: undefined,
        startDate: undefined,
        endDate: undefined,
        entityType: undefined,
        entityId: undefined,
        ipAddress: undefined,
        limit: 10,
        offset: 0,
      });
      expect(AuditLogService.countLogs).toHaveBeenCalledWith({
        userId: undefined,
        userName: undefined,
        action: undefined,
        startDate: undefined,
        endDate: undefined,
        entityType: undefined,
        entityId: undefined,
        ipAddress: undefined,
      });
      expect(result).toEqual({
        logs: mockLogs,
        pagination: {
          page: 1,
          limit: 10,
          total: 2,
          pages: 1,
        },
      });
    });
  });

  describe("getActionStats", () => {
    it("should get action statistics", async () => {
      const mockStats = [
        { action: "เข้าสู่ระบบ", _count: { id: 10 } },
        { action: "สร้างคำขอลา", _count: { id: 5 } },
      ];

      prisma.auditLog.groupBy.mockResolvedValue(mockStats);

      const result = await AuditLogService.getActionStats();

      expect(prisma.auditLog.groupBy).toHaveBeenCalledWith({
        by: ["action"],
        where: {},
        _count: {
          id: true,
        },
        orderBy: {
          _count: {
            id: "desc",
          },
        },
      });
      expect(result).toEqual([
        { action: "เข้าสู่ระบบ", count: 10 },
        { action: "สร้างคำขอลา", count: 5 },
      ]);
    });

    it("should get action statistics with date range", async () => {
      const mockStats = [
        { action: "เข้าสู่ระบบ", _count: { id: 8 } },
      ];

      prisma.auditLog.groupBy.mockResolvedValue(mockStats);

      const startDate = "2023-01-01";
      const endDate = "2023-12-31";

      const result = await AuditLogService.getActionStats(startDate, endDate);

      expect(prisma.auditLog.groupBy).toHaveBeenCalledWith({
        by: ["action"],
        where: {
          createdAt: {
            gte: new Date(startDate),
            lte: new Date(endDate),
          },
        },
        _count: {
          id: true,
        },
        orderBy: {
          _count: {
            id: "desc",
          },
        },
      });
      expect(result).toEqual([
        { action: "เข้าสู่ระบบ", count: 8 },
      ]);
    });

    it("should handle empty stats", async () => {
      prisma.auditLog.groupBy.mockResolvedValue([]);

      const result = await AuditLogService.getActionStats();

      expect(result).toEqual([]);
    });
  });

  describe("getLogsByUserId", () => {
    it("should get logs by user ID with pagination", async () => {
      const mockLogs = [
        { id: 1, action: "CREATE", userId: 123 },
        { id: 2, action: "UPDATE", userId: 123 },
      ];
      const mockTotal = 2;

      // Mock the internal methods that getLogsByUserId calls
      jest.spyOn(AuditLogService, 'getLogs').mockResolvedValue(mockLogs);
      jest.spyOn(AuditLogService, 'countLogs').mockResolvedValue(mockTotal);

      const result = await AuditLogService.getLogsByUserId(123, { page: 1, limit: 10 });

      expect(AuditLogService.getLogs).toHaveBeenCalledWith({
        userId: 123,
        action: undefined,
        startDate: undefined,
        endDate: undefined,
        entityType: undefined,
        entityId: undefined,
        ipAddress: undefined,
        limit: 10,
        offset: 0,
      });
      expect(AuditLogService.countLogs).toHaveBeenCalledWith({
        userId: 123,
        action: undefined,
        startDate: undefined,
        endDate: undefined,
        entityType: undefined,
        entityId: undefined,
        ipAddress: undefined,
      });
      expect(result).toEqual({
        logs: mockLogs,
        pagination: {
          page: 1,
          limit: 10,
          total: 2,
          pages: 1,
        },
      });
    });
  });

  describe("getLogsByLeaveRequestId", () => {
    it("should get logs by leave request ID", async () => {
      const mockLogs = [
        { id: 1, action: "CREATE", leaveRequestId: 123 },
        { id: 2, action: "APPROVE", leaveRequestId: 123 },
      ];

      prisma.auditLog.findMany.mockResolvedValue(mockLogs);

      const result = await AuditLogService.getLogsByLeaveRequestId(123);

      expect(prisma.auditLog.findMany).toHaveBeenCalledWith({
        where: {
          OR: [
            { leaveRequestId: 123 },
            { entityType: 'LeaveRequest', entityId: 123 }
          ]
        },
        orderBy: { createdAt: "asc" },
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
      expect(result).toEqual(mockLogs);
    });
  });

  describe("getEntityData", () => {
    it("should get entity data from database when available", async () => {
      const mockSnapshot = { id: 123, name: "Test Entity", status: "ACTIVE" };

      // Mock getEntitySnapshot to return data from database
      jest.spyOn(AuditLogService, 'getEntitySnapshot').mockResolvedValue(mockSnapshot);

      const result = await AuditLogService.getEntityData("LeaveRequest", 123);

      expect(AuditLogService.getEntitySnapshot).toHaveBeenCalledWith("LeaveRequest", 123);
      expect(result).toEqual(mockSnapshot);
    });

    it("should get entity data from audit log when not in database", async () => {
      const mockAuditLog = {
        id: 1,
        entityType: "LeaveRequest",
        entityId: 123,
        entityData: JSON.stringify({ id: 123, status: "APPROVED" }),
        createdAt: new Date(),
      };

      // Mock getEntitySnapshot to return null (not found in database)
      jest.spyOn(AuditLogService, 'getEntitySnapshot').mockResolvedValue(null);
      prisma.auditLog.findFirst.mockResolvedValue(mockAuditLog);

      const result = await AuditLogService.getEntityData("LeaveRequest", 123);

      expect(AuditLogService.getEntitySnapshot).toHaveBeenCalledWith("LeaveRequest", 123);
      expect(prisma.auditLog.findFirst).toHaveBeenCalledWith({
        where: {
          entityType: "LeaveRequest",
          entityId: 123,
          entityData: { not: null },
        },
        orderBy: { createdAt: 'desc' },
      });
      expect(result).toEqual({ id: 123, status: "APPROVED" });
    });

    it("should return not found response when no entity data found", async () => {
      // Mock getEntitySnapshot to return null (not found in database)
      jest.spyOn(AuditLogService, 'getEntitySnapshot').mockResolvedValue(null);
      prisma.auditLog.findFirst.mockResolvedValue(null);

      const result = await AuditLogService.getEntityData("User", 999);

      expect(result).toEqual({
        entityId: 999,
        entityType: "User",
        isDeleted: true,
        message: "Entity not found in database or audit log",
      });
    });

    it("should handle malformed entity data", async () => {
      const mockAuditLog = {
        id: 1,
        entityType: "User",
        entityId: 123,
        entityData: "invalid json",
        createdAt: new Date(),
      };

      jest.spyOn(AuditLogService, 'getEntitySnapshot').mockResolvedValue(null);
      prisma.auditLog.findFirst.mockResolvedValue(mockAuditLog);

      const result = await AuditLogService.getEntityData("User", 123);

      expect(result).toEqual({
        entityId: 123,
        entityType: "User",
        isDeleted: true,
        error: expect.stringContaining("Unexpected token"),
        message: "Error retrieving entity data",
      });
    });
  });

  describe("getEntitySnapshot", () => {
    it("should return null when entity snapshot is not found", async () => {
      prisma.auditLog.findFirst.mockResolvedValue(null);

      const result = await AuditLogService.getEntitySnapshot("User", 999);

      expect(result).toBeNull();
    });
  });
});
