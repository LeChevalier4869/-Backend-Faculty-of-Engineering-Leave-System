jest.mock("../../../services/leaveBalance-service", () => ({
  getLeaveSummaryByUser: jest.fn(),
  getBalanceById: jest.fn(),
}));

const LeaveBalanceService = require("../../../services/leaveBalance-service");
const leaveBalanceController = require("../../../controllers/leaveBalance-controller");

const makeRes = () => {
  const res = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  return res;
};

const flushPromises = () => new Promise((resolve) => setImmediate(resolve));

describe("leaveBalance-controller.getMyLeaveSummary", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, "error").mockImplementation(() => {});
  });

  it("returns summary", async () => {
    LeaveBalanceService.getLeaveSummaryByUser.mockResolvedValue([{ id: 1 }]);

    const req = { user: { id: 10 } };
    const res = makeRes();

    leaveBalanceController.getMyLeaveSummary(req, res);
    await flushPromises();

    expect(LeaveBalanceService.getLeaveSummaryByUser).toHaveBeenCalledWith(10);
    expect(res.json).toHaveBeenCalledWith([{ id: 1 }]);
  });

  it("returns 500 on error", async () => {
    LeaveBalanceService.getLeaveSummaryByUser.mockRejectedValue(new Error("boom"));

    const req = { user: { id: 10 } };
    const res = makeRes();

    leaveBalanceController.getMyLeaveSummary(req, res);
    await flushPromises();

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ message: "Internal server error" });
  });
});
