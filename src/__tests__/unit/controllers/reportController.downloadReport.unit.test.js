jest.mock("../../../services/report-service");
jest.mock("../../../services/leaveBalance-service");
jest.mock("../../../services/leaveRequest-service");
jest.mock("../../../services/pdfService", () => ({
  fillPDFTemplate: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("fs", () => {
  const actual = jest.requireActual("fs");
  const events = {};
  const fakeStream = {
    pipe: jest.fn(),
    on: jest.fn((evt, cb) => {
      events[evt] = cb;
      return fakeStream;
    }),
    __emit: (evt, arg) => {
      if (events[evt]) events[evt](arg);
    },
  };

  return {
    ...actual,
    createReadStream: jest.fn(() => fakeStream),
    unlink: jest.fn((_, cb) => cb && cb(null)),
    __fakeStream: fakeStream,
  };
});

const fs = require("fs");
const ReportService = require("../../../services/report-service");
const LeaveBalanceService = require("../../../services/leaveBalance-service");
const LeaveRequestService = require("../../../services/leaveRequest-service");
const { downloadReport } = require("../../../controllers/reportController");

const makeRes = () => {
  const res = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  res.send = jest.fn(() => res);
  res.setHeader = jest.fn(() => res);
  return res;
};

describe("reportController.downloadReport", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, "log").mockImplementation(() => {});

    ReportService.downloadReport.mockResolvedValue({
      department: { organizationId: "ORG" },
      employmentType: "FULLTIME",
    });

    LeaveBalanceService.getLeaveSummaryByUser.mockResolvedValue([
      { leaveTypeId: 1, year: new Date().getFullYear(), usedDays: 1, remainingDays: 9 },
      { leaveTypeId: 3, year: new Date().getFullYear(), usedDays: 2, remainingDays: 8 },
      { leaveTypeId: 4, year: new Date().getFullYear(), usedDays: 3, remainingDays: 7 },
      { leaveTypeId: 4, year: new Date().getFullYear() - 1, usedDays: 0, remainingDays: 1 },
    ]);

    LeaveRequestService.getRecentLeaveBefore.mockResolvedValue([
      { leaveTypeId: 1, leavedDays: 1, totalDays: 10 },
      { leaveTypeId: 3, leavedDays: 1, totalDays: 10 },
      { leaveTypeId: 4, leavedDays: 1, totalDays: 10 },
    ]);
  });

  it("returns 400 when leaveTypeId is not allowed", async () => {
    const req = {
      body: { leaveTypeId: 2, userId: 5 },
      user: { id: 1, role: ["ADMIN"] },
    };
    const res = makeRes();

    await downloadReport(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      error: "leaveTypeId ต้อง 1 หรือ 3 หรือ 4 เท่านั้น",
    });
    expect(ReportService.downloadReport).not.toHaveBeenCalled();
  });

  it("returns 400 when computed userId is invalid", async () => {
    const req = {
      body: { leaveTypeId: 1 },
      user: { role: ["ADMIN"] },
    };
    const res = makeRes();

    await downloadReport(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: "userId ไม่ถูกต้อง" });
    expect(ReportService.downloadReport).not.toHaveBeenCalled();
  });

  it("returns 403 when requesting different userId without ADMIN role", async () => {
    const req = {
      body: { leaveTypeId: 1, userId: 99 },
      user: { id: 1, role: ["USER"] },
    };
    const res = makeRes();

    await downloadReport(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ error: "Forbidden" });
    expect(ReportService.downloadReport).not.toHaveBeenCalled();
  });

  it("uses requestedUserId when provided and requester is ADMIN", async () => {
    const req = {
      body: { leaveTypeId: 1, userId: 55 },
      user: { id: 1, role: ["ADMIN"] },
    };
    const res = makeRes();

    await downloadReport(req, res);

    expect(ReportService.downloadReport).toHaveBeenCalledWith(55);
    expect(LeaveBalanceService.getLeaveSummaryByUser).toHaveBeenCalledWith(55);
    expect(LeaveRequestService.getRecentLeaveBefore).toHaveBeenCalled();
    expect(fs.createReadStream).toHaveBeenCalledTimes(1);
    expect(res.setHeader).toHaveBeenCalledWith("Content-Type", "application/pdf");
  });

  it("falls back to requesterId when requestedUserId is not provided", async () => {
    const req = {
      body: { leaveTypeId: 3 },
      user: { id: 7, role: ["USER"] },
    };
    const res = makeRes();

    await downloadReport(req, res);

    expect(ReportService.downloadReport).toHaveBeenCalledWith(7);
    expect(LeaveBalanceService.getLeaveSummaryByUser).toHaveBeenCalledWith(7);
  });

  it("accepts roles array in req.user.roles (ADMIN)", async () => {
    const req = {
      body: { leaveTypeId: 4, userId: 88 },
      user: { id: 1, roles: ["ADMIN"] },
    };
    const res = makeRes();

    await downloadReport(req, res);

    expect(ReportService.downloadReport).toHaveBeenCalledWith(88);
    expect(LeaveBalanceService.getLeaveSummaryByUser).toHaveBeenCalledWith(88);
  });
});
