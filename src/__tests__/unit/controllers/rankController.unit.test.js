jest.mock("../../../services/rank-service", () => ({
  getAllRanks: jest.fn(),
  getRankById: jest.fn(),
  createRank: jest.fn(),
  updateRank: jest.fn(),
  deleteRank: jest.fn(),
  findOverlappingRank: jest.fn(),
}));
jest.mock("../../../services/auditLog-service", () => ({
  createLog: jest.fn(),
  createUpdateLog: jest.fn(),
}));

const RankService = require("../../../services/rank-service");
const AuditLogService = require("../../../services/auditLog-service");
const rankController = require("../../../controllers/rank-controller");

const makeRes = () => {
  const res = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  return res;
};
const makeReq = (body = {}, params = {}) => ({
  body,
  params,
  user: { id: 1 },
  ip: "127.0.0.1",
  get: () => "jest",
});
const makeNext = () => jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  RankService.findOverlappingRank.mockResolvedValue(null);
  RankService.createRank.mockResolvedValue({ id: 10, rank: "R1" });
  RankService.updateRank.mockResolvedValue({ id: 5, rank: "R1" });
  AuditLogService.createLog.mockResolvedValue({});
  AuditLogService.createUpdateLog.mockResolvedValue({});
});

describe("rankController.createRank", () => {
  const base = {
    rank: "R1",
    personnelTypeId: "2",
    leaveTypeId: "3",
    isBalance: false,
  };

  it("แปลงช่องตัวเลขว่างเป็น null (ไม่เป็น NaN)", async () => {
    const req = makeReq({
      ...base,
      minHireMonths: "",
      maxHireMonths: "",
      receiveDays: "",
      maxDays: "",
    });
    const res = makeRes();
    const next = makeNext();

    await rankController.createRank(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(RankService.createRank).toHaveBeenCalledWith(
      expect.objectContaining({
        rank: "R1",
        minHireMonths: null,
        maxHireMonths: null,
        receiveDays: null,
        maxDays: null,
        personnelTypeId: 2,
        leaveTypeId: 3,
      })
    );
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it("400 เมื่อ minHireMonths > maxHireMonths", async () => {
    const req = makeReq({ ...base, minHireMonths: "10", maxHireMonths: "5" });
    const res = makeRes();
    const next = makeNext();

    await rankController.createRank(req, res, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 400 })
    );
    expect(RankService.createRank).not.toHaveBeenCalled();
  });

  it("400 เมื่อ receiveDays > maxDays", async () => {
    const req = makeReq({ ...base, receiveDays: "20", maxDays: "10" });
    const res = makeRes();
    const next = makeNext();

    await rankController.createRank(req, res, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 400 })
    );
    expect(RankService.createRank).not.toHaveBeenCalled();
  });

  it("400 เมื่อช่วงอายุงานทับซ้อน", async () => {
    RankService.findOverlappingRank.mockResolvedValue({ rank: "เดิม" });
    const req = makeReq({ ...base, minHireMonths: "0", maxHireMonths: "12" });
    const res = makeRes();
    const next = makeNext();

    await rankController.createRank(req, res, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 400 })
    );
    expect(RankService.createRank).not.toHaveBeenCalled();
  });

  it("400 เมื่อขาด field จำเป็น (rank)", async () => {
    const req = makeReq({ personnelTypeId: "2", leaveTypeId: "3" });
    const res = makeRes();
    const next = makeNext();

    await rankController.createRank(req, res, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 400 })
    );
    expect(RankService.createRank).not.toHaveBeenCalled();
  });
});

describe("rankController.updateRank", () => {
  const oldRank = {
    id: 5,
    rank: "R1",
    personnelTypeId: 2,
    leaveTypeId: 3,
    minHireMonths: 0,
    maxHireMonths: 12,
    receiveDays: 10,
    maxDays: 10,
  };

  it("อัปเดตสำเร็จ + ส่งค่าที่ parse แล้ว", async () => {
    RankService.getRankById.mockResolvedValue(oldRank);
    const req = makeReq({ receiveDays: "5" }, { id: "5" });
    const res = makeRes();
    const next = makeNext();

    await rankController.updateRank(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(RankService.updateRank).toHaveBeenCalledWith(
      5,
      expect.objectContaining({ receiveDays: 5 })
    );
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it("400 เมื่อแก้แล้วทับซ้อนกับ rank อื่น", async () => {
    RankService.getRankById.mockResolvedValue(oldRank);
    RankService.findOverlappingRank.mockResolvedValue({ rank: "อื่น" });
    const req = makeReq({ minHireMonths: "0", maxHireMonths: "24" }, { id: "5" });
    const res = makeRes();
    const next = makeNext();

    await rankController.updateRank(req, res, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 400 })
    );
    expect(RankService.updateRank).not.toHaveBeenCalled();
  });

  it("404 เมื่อไม่พบ rank", async () => {
    RankService.getRankById.mockResolvedValue(null);
    const req = makeReq({ receiveDays: "5" }, { id: "999" });
    const res = makeRes();
    const next = makeNext();

    await rankController.updateRank(req, res, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 404 })
    );
  });
});

describe("rankController.deleteRank", () => {
  it("ลบสำเร็จเมื่อไม่มีผู้ใช้ผูกอยู่", async () => {
    RankService.getRankById.mockResolvedValue({ id: 5, rank: "R1" });
    RankService.deleteRank.mockResolvedValue({});
    const req = makeReq({}, { id: "5" });
    const res = makeRes();
    const next = makeNext();

    await rankController.deleteRank(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it("ส่งต่อ error เมื่อ rank มีผู้ใช้ผูกอยู่ (FK)", async () => {
    RankService.getRankById.mockResolvedValue({ id: 5, rank: "R1" });
    const inUseErr = Object.assign(new Error("in use"), { statusCode: 400 });
    RankService.deleteRank.mockRejectedValue(inUseErr);
    const req = makeReq({}, { id: "5" });
    const res = makeRes();
    const next = makeNext();

    await rankController.deleteRank(req, res, next);

    expect(next).toHaveBeenCalledWith(inUseErr);
    expect(res.status).not.toHaveBeenCalledWith(200);
  });
});
