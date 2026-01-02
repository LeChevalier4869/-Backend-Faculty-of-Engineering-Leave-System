jest.mock("../../../services/proxyApproval-service");
jest.mock("../../../services/auditLog-service");

const ProxyApprovalService = require("../../../services/proxyApproval-service");
const AuditLogService = require("../../../services/auditLog-service");
const proxyApprovalController = require("../../../controllers/proxyApproval-controller");
const createError = require("../../../utils/createError");

const makeRes = () => {
  const res = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  return res;
};

const makeNext = () => jest.fn();

describe("Proxy Approval Controller", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("createProxyApproval", () => {
    it("should create proxy approval successfully", async () => {
      const mockProxyApproval = {
        originalApproverId: 1,
        proxyApproverId: 2,
        approverLevel: 1,
        startDate: "2024-01-01",
        endDate: "2024-01-31",
        reason: "ลาพักผ่อน",
        isDaily: false,
        dailyDate: null,
      };

      const mockResult = {
        id: 1,
        ...mockProxyApproval,
      };

      ProxyApprovalService.createProxyApproval.mockResolvedValue(mockResult);
      AuditLogService.createLog.mockResolvedValue({});

      const req = {
        body: mockProxyApproval,
        user: { id: 1 },
      };
      const res = makeRes();
      const next = makeNext();

      await proxyApprovalController.createProxyApproval(req, res, next);

      expect(ProxyApprovalService.createProxyApproval).toHaveBeenCalledWith(mockProxyApproval);
      expect(AuditLogService.createLog).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith({
        message: "สร้างการมอบอำนาจสำเร็จ",
        data: mockResult,
      });
    });

    it("should handle errors", async () => {
      const error = new Error("Service error");
      ProxyApprovalService.createProxyApproval.mockRejectedValue(error);

      const req = {
        body: {},
        user: { id: 1 },
      };
      const res = makeRes();
      const next = makeNext();

      await proxyApprovalController.createProxyApproval(req, res, next);

      expect(next).toHaveBeenCalledWith(error);
    });
  });

  describe("getAllProxyApprovals", () => {
    it("should get all proxy approvals", async () => {
      const mockApprovals = [
        { id: 1, originalApproverId: 1, proxyApproverId: 2 },
        { id: 2, originalApproverId: 3, proxyApproverId: 4 },
      ];

      ProxyApprovalService.getAllProxyApprovals.mockResolvedValue(mockApprovals);

      const req = {};
      const res = makeRes();
      const next = makeNext();

      await proxyApprovalController.getAllProxyApprovals(req, res, next);

      expect(ProxyApprovalService.getAllProxyApprovals).toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith({
        message: "ดึงข้อมูลการมอบอำนาจทั้งหมดสำเร็จ",
        data: mockApprovals,
      });
    });
  });

  describe("getProxyApprovalById", () => {
    it("should get proxy approval by id", async () => {
      const mockApproval = { id: 1, originalApproverId: 1, proxyApproverId: 2 };

      ProxyApprovalService.getProxyApprovalById.mockResolvedValue(mockApproval);

      const req = { params: { id: "1" } };
      const res = makeRes();
      const next = makeNext();

      await proxyApprovalController.getProxyApprovalById(req, res, next);

      expect(ProxyApprovalService.getProxyApprovalById).toHaveBeenCalledWith("1");
      expect(res.json).toHaveBeenCalledWith({
        message: "ดึงข้อมูลการมอบอำนาจสำเร็จ",
        data: mockApproval,
      });
    });
  });

  describe("getProxyApprovalsByOriginalApprover", () => {
    it("should get proxy approvals where user is original approver", async () => {
      const mockApprovals = [{ id: 1, originalApproverId: 1, proxyApproverId: 2 }];

      ProxyApprovalService.getProxyApprovalsByOriginalApprover.mockResolvedValue(mockApprovals);

      const req = { user: { id: 1 } };
      const res = makeRes();
      const next = makeNext();

      await proxyApprovalController.getProxyApprovalsByOriginalApprover(req, res, next);

      expect(ProxyApprovalService.getProxyApprovalsByOriginalApprover).toHaveBeenCalledWith(1);
      expect(res.json).toHaveBeenCalledWith({
        message: "ดึงข้อมูลการมอบอำนาจที่คุณเป็นผู้อนุมัติต้นฉบับสำเร็จ",
        data: mockApprovals,
      });
    });
  });

  describe("getProxyApprovalsByProxyApprover", () => {
    it("should get proxy approvals where user is proxy approver", async () => {
      const mockApprovals = [{ id: 1, originalApproverId: 1, proxyApproverId: 2 }];

      ProxyApprovalService.getProxyApprovalsByProxyApprover.mockResolvedValue(mockApprovals);

      const req = { user: { id: 2 } };
      const res = makeRes();
      const next = makeNext();

      await proxyApprovalController.getProxyApprovalsByProxyApprover(req, res, next);

      expect(ProxyApprovalService.getProxyApprovalsByProxyApprover).toHaveBeenCalledWith(2);
      expect(res.json).toHaveBeenCalledWith({
        message: "ดึงข้อมูลการมอบอำนาจที่คุณเป็นผู้อนุมัติแทนสำเร็จ",
        data: mockApprovals,
      });
    });
  });

  describe("getActiveProxyApproval", () => {
    it("should get active proxy approval", async () => {
      const mockApproval = { id: 1, originalApproverId: 1, proxyApproverId: 2 };

      ProxyApprovalService.getActiveProxyApproval.mockResolvedValue(mockApproval);

      const req = { query: { originalApproverId: "1", approverLevel: "1" } };
      const res = makeRes();
      const next = makeNext();

      await proxyApprovalController.getActiveProxyApproval(req, res, next);

      expect(ProxyApprovalService.getActiveProxyApproval).toHaveBeenCalledWith("1", "1");
      expect(res.json).toHaveBeenCalledWith({
        message: "ตรวจสอบการมอบอำนาจสำเร็จ",
        data: mockApproval,
      });
    });

    it("should return error when missing parameters", async () => {
      const req = { query: {} };
      const res = makeRes();
      const next = makeNext();

      await proxyApprovalController.getActiveProxyApproval(req, res, next);

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({
          message: "ต้องระบุ originalApproverId และ approverLevel",
        })
      );
    });
  });

  describe("checkApprovalPermission", () => {
    it("should check approval permission", async () => {
      const mockPermission = { canApprove: true, isProxy: false };

      ProxyApprovalService.canUserApprove.mockResolvedValue(mockPermission);

      const req = { user: { id: 1 }, query: { approverLevel: "1" } };
      const res = makeRes();
      const next = makeNext();

      await proxyApprovalController.checkApprovalPermission(req, res, next);

      expect(ProxyApprovalService.canUserApprove).toHaveBeenCalledWith(1, "1");
      expect(res.json).toHaveBeenCalledWith({
        message: "ตรวจสอบสิทธิ์การอนุมัติสำเร็จ",
        data: mockPermission,
      });
    });
  });

  describe("getPotentialApprovers", () => {
    it("should get potential approvers", async () => {
      const mockApprovers = [
        { id: 1, firstName: "John", lastName: "Doe" },
        { id: 2, firstName: "Jane", lastName: "Smith" },
      ];

      ProxyApprovalService.getPotentialApprovers.mockResolvedValue(mockApprovers);

      const req = { query: { approverLevel: "1" } };
      const res = makeRes();
      const next = makeNext();

      await proxyApprovalController.getPotentialApprovers(req, res, next);

      expect(ProxyApprovalService.getPotentialApprovers).toHaveBeenCalledWith(1);
      expect(res.json).toHaveBeenCalledWith({
        message: "ดึงข้อมูลผู้อนุมัติที่เป็นไปได้สำเร็จ",
        data: mockApprovers,
      });
    });
  });

  describe("updateProxyApproval", () => {
    it("should update proxy approval", async () => {
      const mockUpdatedApproval = { id: 1, reason: "Updated reason" };

      ProxyApprovalService.updateProxyApproval.mockResolvedValue(mockUpdatedApproval);
      AuditLogService.createLog.mockResolvedValue({});

      const req = { params: { id: "1" }, body: { reason: "Updated reason" }, user: { id: 1 } };
      const res = makeRes();
      const next = makeNext();

      await proxyApprovalController.updateProxyApproval(req, res, next);

      expect(ProxyApprovalService.updateProxyApproval).toHaveBeenCalledWith("1", { reason: "Updated reason" });
      expect(AuditLogService.createLog).toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith({
        message: "อัปเดตการมอบอำนาจสำเร็จ",
        data: mockUpdatedApproval,
      });
    });
  });

  describe("cancelProxyApproval", () => {
    it("should cancel proxy approval", async () => {
      const mockCancelledApproval = { id: 1, status: "CANCELLED" };

      ProxyApprovalService.cancelProxyApproval.mockResolvedValue(mockCancelledApproval);

      const req = { params: { id: "1" }, user: { id: 1 } };
      const res = makeRes();
      const next = makeNext();

      await proxyApprovalController.cancelProxyApproval(req, res, next);

      expect(ProxyApprovalService.cancelProxyApproval).toHaveBeenCalledWith("1", 1);
      expect(res.json).toHaveBeenCalledWith({
        message: "ยกเลิกการมอบอำนาจสำเร็จ",
        data: mockCancelledApproval,
      });
    });
  });

  describe("expireProxyApprovals", () => {
    it("should expire proxy approvals", async () => {
      const mockResult = {
        periodProxies: { count: 3 },
        dailyProxies: { count: 2 },
        totalExpired: 5,
      };

      ProxyApprovalService.expireProxyApprovals.mockResolvedValue(mockResult);

      const req = {};
      const res = makeRes();
      const next = makeNext();

      await proxyApprovalController.expireProxyApprovals(req, res, next);

      expect(ProxyApprovalService.expireProxyApprovals).toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith({
        message: "อัปเดตสถานะการมอบอำนาจที่หมดอายุสำเร็จ",
        data: {
          periodProxies: 3,
          dailyProxies: 2,
          totalExpired: 5,
        },
      });
    });
  });

  describe("getProxyApprovalStats", () => {
    it("should get proxy approval statistics", async () => {
      const mockStats = { total: 10, active: 3, expired: 5, cancelled: 2 };

      // Mock prisma groupBy
      const mockPrisma = {
        proxyApproval: {
          groupBy: jest.fn().mockResolvedValue([
            { status: "ACTIVE", _count: { id: 3 } },
            { status: "EXPIRED", _count: { id: 5 } },
            { status: "CANCELLED", _count: { id: 2 } },
          ]),
          count: jest.fn().mockResolvedValue(10),
        },
      };

      // Mock the prisma import
      jest.doMock("../../../config/prisma", () => mockPrisma);

      const req = {};
      const res = makeRes();
      const next = makeNext();

      await proxyApprovalController.getProxyApprovalStats(req, res, next);

      expect(res.json).toHaveBeenCalledWith({
        message: "ดึงข้อมูลสถิติการมอบอำนาจสำเร็จ",
        data: mockStats,
      });
    });
  });
});
