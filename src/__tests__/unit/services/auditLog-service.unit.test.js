const AuditLogService = require("../../../services/auditLog-service");
const prisma = require("../../../config/prisma");

jest.mock("../../../config/prisma", () => ({
  auditLog: {
    create: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
    groupBy: jest.fn(),
  },
}));

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

      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: {
          userId: 1,
          action: "Test Action",
          entityType: "LeaveRequest",
          entityId: 123,
          details: "Test details",
          ipAddress: null,
          userAgent: null,
          entityData: JSON.stringify(entityData),
          leaveRequestId: 123,
        },
      });
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

      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: {
          userId: 1,
          action: "Test Action",
          entityType: null,
          entityId: null,
          details: null,
          ipAddress: null,
          userAgent: null,
          entityData: null,
          leaveRequestId: null,
        },
      });
      expect(result).toEqual(mockLog);
    });
  });

  describe("logUserAction", () => {
    it("should log user action with predefined action text", async () => {
      const mockLog = {
        id: 1,
        userId: 1,
        action: "เข้าสู่ระบบ",
        details: "User logged in",
        createdAt: new Date(),
      };

      prisma.auditLog.create.mockResolvedValue(mockLog);

      const result = await AuditLogService.logUserAction(1, "LOGIN", "User logged in");

      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: {
          userId: 1,
          action: "เข้าสู่ระบบ",
          entityType: "UserAction",
          entityId: null,
          details: "User logged in",
          ipAddress: null,
          userAgent: null,
          entityData: null,
          leaveRequestId: null,
        },
      });
      expect(result).toEqual(mockLog);
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

      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: {
          userId: 1,
          action: "CUSTOM_ACTION",
          entityType: "UserAction",
          entityId: null,
          details: "Custom details",
          ipAddress: null,
          userAgent: null,
          entityData: null,
          leaveRequestId: null,
        },
      });
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

      prisma.auditLog.findMany.mockResolvedValue(mockLogs);
      prisma.auditLog.count.mockResolvedValue(mockTotal);

      const result = await AuditLogService.getAllLogs({ page: 1, limit: 10 });

      expect(prisma.auditLog.findMany).toHaveBeenCalledWith({
        where: {},
        skip: 0,
        take: 10,
        orderBy: { createdAt: "desc" },
        include: {
          user: {
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
          },
          leaveRequest: {
            select: {
              id: true,
              startDate: true,
              endDate: true,
              status: true,
              leaveType: {
                select: {
                  name: true,
                },
              },
            },
          },
        },
      });
      expect(result).toEqual({
        logs: mockLogs,
        pagination: {
          page: 1,
          limit: 10,
          total: 2,
          totalPages: 1,
        },
      });
    });
  });

  describe("getActionStats", () => {
    it("should get action statistics", async () => {
      const mockStats = [
        { action: "เข้าสู่ระบบ", _count: { action: 10 } },
        { action: "สร้างคำขอลา", _count: { action: 5 } },
      ];

      prisma.auditLog.groupBy.mockResolvedValue(mockStats);

      const result = await AuditLogService.getActionStats();

      expect(prisma.auditLog.groupBy).toHaveBeenCalledWith({
        by: ["action"],
        where: {},
        _count: {
          action: true,
        },
        orderBy: {
          _count: {
            action: "desc",
          },
        },
      });
      expect(result).toEqual([
        { action: "เข้าสู่ระบบ", count: 10 },
        { action: "สร้างคำขอลา", count: 5 },
      ]);
    });
  });
});
