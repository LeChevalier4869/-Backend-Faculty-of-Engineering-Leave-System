jest.mock("../../../services/leaveRequest-service");
jest.mock("../../../services/leaveBalance-service");
jest.mock("../../../services/auditLog-service");
jest.mock("../../../utils/cloudUpload", () => jest.fn());

const LeaveRequestService = require("../../../services/leaveRequest-service");
const LeaveBalanceService = require("../../../services/leaveBalance-service");
const AuditLogService = require("../../../services/auditLog-service");
const cloudUpload = require("../../../utils/cloudUpload");

const leaveRequestController = require("../../../controllers/leaveRequest-controller");

const makeRes = () => {
  const res = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  return res;
};

describe("leaveRequest-controller.createLeaveRequest", () => {
  beforeEach(() => {
    jest.clearAllMocks();

    LeaveRequestService.createRequest.mockResolvedValue({
      id: 123,
      thisTimeDays: 2,
    });

    LeaveBalanceService.updatePendingLeaveBalance.mockResolvedValue(undefined);
    AuditLogService.createLog.mockResolvedValue(undefined);

    cloudUpload.mockResolvedValue("https://example.com/file.png");
    LeaveRequestService.attachImages.mockResolvedValue(undefined);
  });

  it("creates leave request, updates pending balance, creates audit log, returns 201", async () => {
    const req = {
      user: { id: 10 },
      get: jest.fn(),
      ip: "127.0.0.1",
      body: {
        leaveTypeId: 1,
        startDate: "2025-01-01",
        endDate: "2025-01-02",
        reason: "test",
        contact: "call me",
      },
      files: [],
    };
    const res = makeRes();
    const next = jest.fn();

    await leaveRequestController.createLeaveRequest(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(LeaveRequestService.createRequest).toHaveBeenCalledWith(
      10,
      1,
      "2025-01-01",
      "2025-01-02",
      "test",
      "call me"
    );
    expect(LeaveBalanceService.updatePendingLeaveBalance).toHaveBeenCalledWith(10, 1, 2);
    expect(AuditLogService.createLog).toHaveBeenCalledWith(
      10,
      "Create Request",
      "LeaveRequest",
      123,
      expect.stringContaining("สร้างคำขอลา: 123 (ลา 2 วัน)"),
      "127.0.0.1",
      undefined,
      expect.objectContaining({
        leaveTypeId: undefined,
        requestedDays: 2,
        action: 'CREATE'
      })
    );
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({ message: "คำขอลาได้ถูกสร้าง", requestId: 123 });
  });

  it("attaches uploaded images when req.files provided", async () => {
    const req = {
      user: { id: 10 },
      get: jest.fn(),
      ip: "127.0.0.1",
      body: {
        leaveTypeId: 1,
        startDate: "2025-01-01",
        endDate: "2025-01-02",
        reason: "test",
        contact: "",
      },
      files: [{ path: "a" }, { path: "b" }],
    };
    const res = makeRes();
    const next = jest.fn();

    cloudUpload
      .mockResolvedValueOnce("https://example.com/a.png")
      .mockResolvedValueOnce("https://example.com/b.png");

    await leaveRequestController.createLeaveRequest(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(cloudUpload).toHaveBeenCalledTimes(2);
    expect(LeaveRequestService.attachImages).toHaveBeenCalledTimes(1);
    const arg = LeaveRequestService.attachImages.mock.calls[0][0];
    expect(Array.isArray(arg)).toBe(true);
    expect(arg).toHaveLength(2);
    expect(arg[0]).toEqual(
      expect.objectContaining({
        type: "EVIDENT",
        leaveRequestId: 123,
        filePath: "https://example.com/a.png",
        name: expect.any(String),
      })
    );
  });

  it("passes error to next when service returns missing id", async () => {
    LeaveRequestService.createRequest.mockResolvedValue({ thisTimeDays: 1 });

    const req = {
      user: { id: 10 },
      body: {
        leaveTypeId: 1,
        startDate: "2025-01-01",
        endDate: "2025-01-02",
        reason: "test",
        contact: "",
      },
      files: [],
    };
    const res = makeRes();
    const next = jest.fn();

    await leaveRequestController.createLeaveRequest(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    const err = next.mock.calls[0][0];
    expect(err).toBeInstanceOf(Error);
    expect(err.statusCode).toBe(500);
  });

  it("passes error to next when thisTimeDays is invalid", async () => {
    LeaveRequestService.createRequest.mockResolvedValue({ id: 123, thisTimeDays: "x" });

    const req = {
      user: { id: 10 },
      body: {
        leaveTypeId: 1,
        startDate: "2025-01-01",
        endDate: "2025-01-02",
        reason: "test",
        contact: "",
      },
      files: [],
    };
    const res = makeRes();
    const next = jest.fn();

    await leaveRequestController.createLeaveRequest(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    const err = next.mock.calls[0][0];
    expect(err).toBeInstanceOf(Error);
    expect(err.statusCode).toBe(500);
  });

  it("passes error to next when LeaveRequestService.createRequest throws", async () => {
    LeaveRequestService.createRequest.mockRejectedValue(new Error("boom"));

    const req = {
      user: { id: 10 },
      body: {
        leaveTypeId: 1,
        startDate: "2025-01-01",
        endDate: "2025-01-02",
        reason: "test",
        contact: "",
      },
      files: [],
    };
    const res = makeRes();
    const next = jest.fn();

    await leaveRequestController.createLeaveRequest(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(next.mock.calls[0][0]).toBeInstanceOf(Error);
  });
});
