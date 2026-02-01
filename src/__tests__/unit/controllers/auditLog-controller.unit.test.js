jest.mock("../../../services/auditLog-service", () => ({
  getAllLogs: jest.fn(),
  getLogsByUserId: jest.fn(),
  getLogsByLeaveRequestId: jest.fn(),
  getActionStats: jest.fn(),
  createLog: jest.fn(),
  getEntityData: jest.fn(),
  getEntitySnapshot: jest.fn(),
  logUserAction: jest.fn(),
}));

const AuditLogService = require("../../../services/auditLog-service");
const auditLogController = require("../../../controllers/auditLog-controller");
const createError = require("../../../utils/createError");

const makeRes = () => {
  const res = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  return res;
};

describe("auditLog-controller", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("getAllAuditLogs", () => {
    it("should get all audit logs with default parameters", async () => {
      const mockResult = {
        logs: [
          { id: 1, action: "CREATE", user: { firstName: "John" } },
          { id: 2, action: "UPDATE", user: { firstName: "Jane" } },
        ],
        pagination: { page: 1, limit: 50, total: 2, totalPages: 1 },
      };

      AuditLogService.getAllLogs.mockResolvedValue(mockResult);

      const req = { query: {} };
      const res = makeRes();
      const next = jest.fn();

      await auditLogController.getAllAuditLogs(req, res, next);

      expect(AuditLogService.getAllLogs).toHaveBeenCalledWith({
        page: 1,
        limit: 50,
        userId: undefined,
        userName: undefined,
        action: undefined,
        startDate: undefined,
        endDate: undefined,
        entityType: undefined,
        entityId: undefined,
        ipAddress: undefined,
      });
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        message: "ดึงข้อมูล Audit Log สำเร็จ",
        data: mockResult.logs,
        pagination: mockResult.pagination,
      });
      expect(next).not.toHaveBeenCalled();
    });

    it("should get all audit logs with custom parameters", async () => {
      const mockResult = {
        logs: [{ id: 1, action: "CREATE" }],
        pagination: { page: 2, limit: 20, total: 1, totalPages: 1 },
      };

      AuditLogService.getAllLogs.mockResolvedValue(mockResult);

      const req = {
        query: {
          page: "2",
          limit: "20",
          userId: "123",
          userName: "John Doe",
          action: "CREATE",
          startDate: "2023-01-01",
          endDate: "2023-12-31",
          entityType: "LeaveRequest",
          entityId: "456",
          ipAddress: "127.0.0.1",
        },
      };
      const res = makeRes();
      const next = jest.fn();

      await auditLogController.getAllAuditLogs(req, res, next);

      expect(AuditLogService.getAllLogs).toHaveBeenCalledWith({
        page: 2,
        limit: 20,
        userId: "123",
        userName: "John Doe",
        action: "CREATE",
        startDate: "2023-01-01",
        endDate: "2023-12-31",
        entityType: "LeaveRequest",
        entityId: "456",
        ipAddress: "127.0.0.1",
      });
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        message: "ดึงข้อมูล Audit Log สำเร็จ",
        data: mockResult.logs,
        pagination: mockResult.pagination,
      });
    });

    it("should handle errors", async () => {
      const error = new Error("Service error");
      AuditLogService.getAllLogs.mockRejectedValue(error);

      const req = { query: {} };
      const res = makeRes();
      const next = jest.fn();

      await auditLogController.getAllAuditLogs(req, res, next);

      expect(next).toHaveBeenCalledWith(error);
      expect(res.status).not.toHaveBeenCalled();
    });
  });

  describe("getAuditLogsByUserId", () => {
    it("should get audit logs by user ID", async () => {
      const mockResult = {
        logs: [{ id: 1, action: "CREATE", userId: 123 }],
        pagination: { page: 1, limit: 50, total: 1, totalPages: 1 },
      };

      AuditLogService.getLogsByUserId.mockResolvedValue(mockResult);

      const req = {
        params: { userId: "123" },
        query: { page: "1", limit: "50", action: "CREATE" },
      };
      const res = makeRes();
      const next = jest.fn();

      await auditLogController.getAuditLogsByUserId(req, res, next);

      expect(AuditLogService.getLogsByUserId).toHaveBeenCalledWith("123", {
        page: 1,
        limit: 50,
        action: "CREATE",
        startDate: undefined,
        endDate: undefined,
      });
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        message: "ดึงข้อมูล Audit Log ตาม userId สำเร็จ",
        data: mockResult.logs,
        pagination: mockResult.pagination,
      });
    });

    it("should return 400 for invalid user ID", async () => {
      const req = {
        params: { userId: "invalid" },
        query: {},
      };
      const res = makeRes();
      const next = jest.fn();

      await auditLogController.getAuditLogsByUserId(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(Error));
      expect(next.mock.calls[0][0].statusCode).toBe(400);
      expect(next.mock.calls[0][0].message).toBe("Invalid user id");
    });

    it("should return 400 for missing user ID", async () => {
      const req = {
        params: {},
        query: {},
      };
      const res = makeRes();
      const next = jest.fn();

      await auditLogController.getAuditLogsByUserId(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(Error));
      expect(next.mock.calls[0][0].statusCode).toBe(400);
    });
  });

  describe("getAuditLogsByLeaveRequestId", () => {
    it("should get audit logs by leave request ID", async () => {
      const mockLogs = [
        { id: 1, action: "CREATE", leaveRequestId: 123 },
        { id: 2, action: "APPROVE", leaveRequestId: 123 },
      ];

      AuditLogService.getLogsByLeaveRequestId.mockResolvedValue(mockLogs);

      const req = { params: { leaveRequestId: "123" } };
      const res = makeRes();
      const next = jest.fn();

      await auditLogController.getAuditLogsByLeaveRequestId(req, res, next);

      expect(AuditLogService.getLogsByLeaveRequestId).toHaveBeenCalledWith("123");
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        message: "ดึงข้อมูล Audit Log ตามคำขอลาสำเร็จ",
        data: mockLogs,
      });
    });

    it("should return 400 for invalid leave request ID", async () => {
      const req = { params: { leaveRequestId: "invalid" } };
      const res = makeRes();
      const next = jest.fn();

      await auditLogController.getAuditLogsByLeaveRequestId(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(Error));
      expect(next.mock.calls[0][0].statusCode).toBe(400);
      expect(next.mock.calls[0][0].message).toBe("Invalid leave request id");
    });

    it("should return 400 for missing leave request ID", async () => {
      const req = { params: {} };
      const res = makeRes();
      const next = jest.fn();

      await auditLogController.getAuditLogsByLeaveRequestId(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(Error));
      expect(next.mock.calls[0][0].statusCode).toBe(400);
    });
  });

  describe("getActionStats", () => {
    it("should get action statistics", async () => {
      const mockStats = [
        { action: "CREATE", count: 10 },
        { action: "UPDATE", count: 5 },
      ];

      AuditLogService.getActionStats.mockResolvedValue(mockStats);

      const req = {
        query: { startDate: "2023-01-01", endDate: "2023-12-31" },
      };
      const res = makeRes();
      const next = jest.fn();

      await auditLogController.getActionStats(req, res, next);

      expect(AuditLogService.getActionStats).toHaveBeenCalledWith(
        "2023-01-01",
        "2023-12-31"
      );
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        message: "ดึงข้อมูลสถิติการกระทำสำเร็จ",
        data: mockStats,
      });
    });

    it("should get action statistics without date filters", async () => {
      const mockStats = [{ action: "CREATE", count: 10 }];
      AuditLogService.getActionStats.mockResolvedValue(mockStats);

      const req = { query: {} };
      const res = makeRes();
      const next = jest.fn();

      await auditLogController.getActionStats(req, res, next);

      expect(AuditLogService.getActionStats).toHaveBeenCalledWith(
        undefined,
        undefined
      );
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        message: "ดึงข้อมูลสถิติการกระทำสำเร็จ",
        data: mockStats,
      });
    });
  });

  describe("createAuditLog", () => {
    it("should create an audit log successfully", async () => {
      const mockLog = {
        id: 1,
        userId: 123,
        action: "CREATE",
        entityType: "LeaveRequest",
        entityId: 456,
      };

      AuditLogService.createLog.mockResolvedValue(mockLog);

      const req = {
        body: {
          userId: 123,
          action: "CREATE",
          entityType: "LeaveRequest",
          entityId: 456,
          details: "Test details",
          ipAddress: "127.0.0.1",
          userAgent: "Mozilla/5.0",
          entityData: { foo: "bar" },
        },
      };
      const res = makeRes();
      const next = jest.fn();

      await auditLogController.createAuditLog(req, res, next);

      expect(AuditLogService.createLog).toHaveBeenCalledWith(
        123,
        "CREATE",
        "LeaveRequest",
        456,
        "Test details",
        "127.0.0.1",
        "Mozilla/5.0",
        { foo: "bar" }
      );
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith({
        message: "สร้าง Audit Log สำเร็จ",
        data: mockLog,
      });
    });

    it("should create audit log with backward compatibility (leaveRequestId only)", async () => {
      const mockLog = { id: 1, userId: 123, action: "CREATE" };
      AuditLogService.createLog.mockResolvedValue(mockLog);

      const req = {
        body: {
          userId: 123,
          action: "CREATE",
          leaveRequestId: 789,
          details: "Test details",
        },
      };
      const res = makeRes();
      const next = jest.fn();

      await auditLogController.createAuditLog(req, res, next);

      expect(AuditLogService.createLog).toHaveBeenCalledWith(
        123,
        "CREATE",
        "LeaveRequest",
        789,
        "Test details",
        null,
        null,
        null
      );
    });

    it("should return 400 when userId is missing", async () => {
      const req = {
        body: { action: "CREATE" },
      };
      const res = makeRes();
      const next = jest.fn();

      await auditLogController.createAuditLog(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(Error));
      expect(next.mock.calls[0][0].statusCode).toBe(400);
      expect(next.mock.calls[0][0].message).toBe("ต้องระบุ userId และ action");
    });

    it("should return 400 when action is missing", async () => {
      const req = {
        body: { userId: 123 },
      };
      const res = makeRes();
      const next = jest.fn();

      await auditLogController.createAuditLog(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(Error));
      expect(next.mock.calls[0][0].statusCode).toBe(400);
      expect(next.mock.calls[0][0].message).toBe("ต้องระบุ userId และ action");
    });
  });

  describe("getEntityData", () => {
    it("should get entity data successfully", async () => {
      const mockEntityData = { id: 456, name: "Test Entity" };
      const mockSnapshot = { id: 456, deleted: false };

      AuditLogService.getEntityData.mockResolvedValue(mockEntityData);
      AuditLogService.getEntitySnapshot.mockResolvedValue(mockSnapshot);

      const req = {
        params: { entityType: "LeaveRequest", entityId: "456" },
      };
      const res = makeRes();
      const next = jest.fn();

      await auditLogController.getEntityData(req, res, next);

      expect(AuditLogService.getEntityData).toHaveBeenCalledWith(
        "LeaveRequest",
        "456"
      );
      expect(AuditLogService.getEntitySnapshot).toHaveBeenCalledWith(
        "LeaveRequest",
        "456"
      );
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        message: "ดึงข้อมูล entity สำเร็จ",
        data: mockEntityData,
        isDeleted: false,
      });
    });

    it("should return 400 when entityType is missing", async () => {
      const req = {
        params: { entityId: "456" },
      };
      const res = makeRes();
      const next = jest.fn();

      await auditLogController.getEntityData(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(Error));
      expect(next.mock.calls[0][0].statusCode).toBe(400);
      expect(next.mock.calls[0][0].message).toBe(
        "ต้องระบุ entityType และ entityId"
      );
    });

    it("should return 400 when entityId is missing", async () => {
      const req = {
        params: { entityType: "LeaveRequest" },
      };
      const res = makeRes();
      const next = jest.fn();

      await auditLogController.getEntityData(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(Error));
      expect(next.mock.calls[0][0].statusCode).toBe(400);
      expect(next.mock.calls[0][0].message).toBe(
        "ต้องระบุ entityType และ entityId"
      );
    });

    it("should return 404 when entity data not found", async () => {
      AuditLogService.getEntityData.mockResolvedValue(null);

      const req = {
        params: { entityType: "LeaveRequest", entityId: "999" },
      };
      const res = makeRes();
      const next = jest.fn();

      await auditLogController.getEntityData(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(Error));
      expect(next.mock.calls[0][0].statusCode).toBe(404);
      expect(next.mock.calls[0][0].message).toBe("ไม่พบข้อมูล entity");
    });
  });

  describe("logUserAction", () => {
    it("should log user action successfully", async () => {
      const mockLog = {
        id: 1,
        userId: 123,
        action: "LOGIN",
        details: "User logged in",
      };

      AuditLogService.logUserAction.mockResolvedValue(mockLog);

      const req = {
        body: {
          userId: 123,
          action: "LOGIN",
          details: "User logged in",
        },
      };
      const res = makeRes();
      const next = jest.fn();

      await auditLogController.logUserAction(req, res, next);

      expect(AuditLogService.logUserAction).toHaveBeenCalledWith(
        123,
        "LOGIN",
        "User logged in"
      );
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith({
        message: "บันทึกการกระทำของผู้ใช้สำเร็จ",
        data: mockLog,
      });
    });

    it("should return 400 when userId is missing", async () => {
      const req = {
        body: { action: "LOGIN" },
      };
      const res = makeRes();
      const next = jest.fn();

      await auditLogController.logUserAction(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(Error));
      expect(next.mock.calls[0][0].statusCode).toBe(400);
      expect(next.mock.calls[0][0].message).toBe("ต้องระบุ userId และ action");
    });

    it("should return 400 when action is missing", async () => {
      const req = {
        body: { userId: 123 },
      };
      const res = makeRes();
      const next = jest.fn();

      await auditLogController.logUserAction(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(Error));
      expect(next.mock.calls[0][0].statusCode).toBe(400);
      expect(next.mock.calls[0][0].message).toBe("ต้องระบุ userId และ action");
    });
  });
});
