jest.mock("../../../services/leaveRequest-service", () => ({
  updateRequestStatus: jest.fn(),
}));
jest.mock("../../../services/auditLog-service", () => ({
  createUpdateLog: jest.fn(),
}));

jest.mock("../../../config/prisma", () => ({
  leaveRequest: {
    findUnique: jest.fn(),
  },
}));

const LeaveRequestService = require("../../../services/leaveRequest-service");
const AuditLogService = require("../../../services/auditLog-service");
const prisma = require("../../../config/prisma");
const leaveRequestController = require("../../../controllers/leaveRequest-controller");

const makeRes = () => {
  const res = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  return res;
};

describe("leaveRequest-controller.updateLeaveStatus", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    LeaveRequestService.updateRequestStatus.mockResolvedValue({ id: 99, status: "APPROVED" });
    prisma.leaveRequest.findUnique.mockResolvedValue({ id: 99, status: "PENDING" });
    AuditLogService.createUpdateLog.mockResolvedValue(undefined);
  });

  it("calls next(error) when status missing", async () => {
    const req = {
      params: { id: "99" },
      body: { remarks: "x" },
      user: { id: 10, role: ["ADMIN"] },
    };
    const res = makeRes();
    const next = jest.fn();

    await leaveRequestController.updateLeaveStatus(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    const err = next.mock.calls[0][0];
    expect(err).toBeInstanceOf(Error);
    expect(err.statusCode).toBe(400);
  });

  it("calls next(error) when status invalid", async () => {
    const req = {
      params: { id: "99" },
      body: { status: "PENDING" },
      user: { id: 10, role: ["ADMIN"] },
    };
    const res = makeRes();
    const next = jest.fn();

    await leaveRequestController.updateLeaveStatus(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    const err = next.mock.calls[0][0];
    expect(err).toBeInstanceOf(Error);
    expect(err.statusCode).toBe(400);
  });

  it("updates status and creates audit log, returns 200", async () => {
    const req = {
      params: { id: "99" },
      body: { status: "APPROVED", remarks: "ok" },
      user: { id: 10, role: ["APPROVER_1"] },
      get: jest.fn(),
      ip: "127.0.0.1",
    };
    const res = makeRes();
    const next = jest.fn();

    LeaveRequestService.updateRequestStatus.mockResolvedValue({ id: 99, status: "APPROVED" });

    await leaveRequestController.updateLeaveStatus(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(LeaveRequestService.updateRequestStatus).toHaveBeenCalledWith(99, "APPROVED", 10, "ok");
    expect(prisma.leaveRequest.findUnique).toHaveBeenCalledWith({ where: { id: 99 } });
    expect(AuditLogService.createUpdateLog).toHaveBeenCalledWith(
      10,
      "LeaveRequest",
      99,
      { id: 99, status: "PENDING" },
      { id: 99, status: "APPROVED" },
      "127.0.0.1",
      undefined
    );
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      message: "สถานะคำขอลาถูกอัปเดต",
      data: { id: 99, status: "APPROVED" },
    });
  });

  it("uses REJECTION log type when status is REJECTED", async () => {
    const req = {
      params: { id: "99" },
      body: { status: "REJECTED", remarks: "no" },
      user: { id: 10, role: ["APPROVER_1"] },
      get: jest.fn(),
      ip: "127.0.0.1",
    };
    const res = makeRes();
    const next = jest.fn();

    LeaveRequestService.updateRequestStatus.mockResolvedValue({ id: 99, status: "REJECTED" });

    await leaveRequestController.updateLeaveStatus(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(AuditLogService.createUpdateLog).toHaveBeenCalledWith(
      10,
      "LeaveRequest",
      99,
      { id: 99, status: "PENDING" },
      { id: 99, status: "REJECTED" },
      "127.0.0.1",
      undefined
    );
  });
});
