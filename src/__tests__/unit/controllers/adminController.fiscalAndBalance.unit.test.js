// เทส audit log ที่เพิ่มใหม่ให้ deleteLeaveBalanceByYear + updateFiscalYear
jest.mock("../../../services/leaveBalance-service", () => ({
  deleteLeaveBalanceByYear: jest.fn(),
}));
jest.mock("../../../services/auditLog-service", () => ({
  createLog: jest.fn().mockResolvedValue(null),
  createUpdateLog: jest.fn().mockResolvedValue(null),
}));
jest.mock("../../../config/prisma", () => ({
  setting: { update: jest.fn().mockResolvedValue({}), findUnique: jest.fn() },
}));

const LeaveBalanceService = require("../../../services/leaveBalance-service");
const AuditLogService = require("../../../services/auditLog-service");
const prisma = require("../../../config/prisma");
const adminController = require("../../../controllers/admin-controller");

const makeRes = () => {
  const res = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  return res;
};

beforeEach(() => jest.clearAllMocks());

describe("deleteLeaveBalanceByYear — บันทึก audit log", () => {
  it("ลบสำเร็จ → เขียน audit log action LEAVE_BALANCE_DELETE_BY_YEAR และคืน 200", async () => {
    LeaveBalanceService.deleteLeaveBalanceByYear.mockResolvedValue({
      message: "ok",
      deletedCount: 5,
      year: 2025,
    });
    const req = {
      params: { year: "2025" },
      user: { id: 9, email: "admin@rmuti.ac.th" },
    };
    const res = makeRes();

    await adminController.deleteLeaveBalanceByYear(req, res, jest.fn());

    expect(LeaveBalanceService.deleteLeaveBalanceByYear).toHaveBeenCalledWith("2025");
    expect(AuditLogService.createLog).toHaveBeenCalledTimes(1);
    const args = AuditLogService.createLog.mock.calls[0];
    expect(args[0]).toBe(9); // userId
    expect(args[1]).toBe("LEAVE_BALANCE_DELETE_BY_YEAR"); // action
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it("audit log ล้มเหลว ไม่ทำให้ทั้ง request พัง (ยังคืน 200)", async () => {
    LeaveBalanceService.deleteLeaveBalanceByYear.mockResolvedValue({
      message: "ok",
      deletedCount: 1,
      year: 2024,
    });
    AuditLogService.createLog.mockRejectedValueOnce(new Error("log fail"));
    jest.spyOn(console, "error").mockImplementation(() => {});
    const req = { params: { year: "2024" }, user: { id: 1 } };
    const res = makeRes();

    await adminController.deleteLeaveBalanceByYear(req, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(200);
  });
});

describe("updateFiscalYear — บันทึก audit log", () => {
  it("อัปเดตปีงบ → เขียน audit log action FISCAL_YEAR_UPDATE และ update setting 2 ตัว", async () => {
    const req = {
      body: { fiscalYear: 2026, currentYear: 2026 },
      user: { id: 9, email: "admin@rmuti.ac.th" },
    };
    const res = makeRes();

    await adminController.updateFiscalYear(req, res, jest.fn());

    expect(prisma.setting.update).toHaveBeenCalledTimes(2);
    expect(AuditLogService.createLog).toHaveBeenCalledTimes(1);
    expect(AuditLogService.createLog.mock.calls[0][1]).toBe("FISCAL_YEAR_UPDATE");
    expect(res.status).toHaveBeenCalledWith(200);
  });
});
