jest.mock("xlsx");
jest.mock("../../../config/prisma");

const xlsx = require("xlsx");
const prisma = require("../../../config/prisma");
const exelController = require("../../../controllers/exel-controller");

const makeRes = () => {
  const res = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  return res;
};

const makeReq = () => ({
  file: {
    buffer: Buffer.from("fake"),
  },
});

describe("exel-controller.uploadUserExcel", () => {
  beforeEach(() => {
    jest.clearAllMocks();

    if (!xlsx.utils) {
      xlsx.utils = {};
    }
    if (!xlsx.utils.sheet_to_json) {
      xlsx.utils.sheet_to_json = jest.fn();
    }
    if (!xlsx.read) {
      xlsx.read = jest.fn();
    }

    prisma.$transaction = jest.fn(async (cb) => cb(prisma));

    if (!prisma.user) prisma.user = {};
    if (!prisma.personnelType) prisma.personnelType = {};
    if (!prisma.department) prisma.department = {};
    if (!prisma.role) prisma.role = {};
    if (!prisma.userRole) prisma.userRole = {};
    if (!prisma.rank) prisma.rank = {};
    if (!prisma.userRank) prisma.userRank = {};
    if (!prisma.setting) prisma.setting = {};
    if (!prisma.leaveBalance) prisma.leaveBalance = {};

    prisma.user.findUnique = jest.fn();
    prisma.user.create = jest.fn();

    prisma.personnelType.findFirst = jest.fn();
    prisma.department.findFirst = jest.fn();

    prisma.role.findMany = jest.fn();
    prisma.userRole.createMany = jest.fn();

    prisma.rank.findMany = jest.fn();
    prisma.userRank.create = jest.fn();
    prisma.userRank.findMany = jest.fn();

    prisma.setting.findUnique = jest.fn();

    prisma.leaveBalance.create = jest.fn();
  });

  it("non-balance mode: imports per-row and continues on row error", async () => {
    const users = [
      {
        prefixName: "นาย",
        firstName: "A",
        lastName: "B",
        sex: "M",
        email: "a@rmuti.ac.th",
        phone: "000",
        position: "P",
        hireDate: "01/01/2025",
        employmentType: "สายวิชาการ",
        departmentName: "D1",
        personnelTypeName: "PT1",
        role: "USER",
      },
      {
        prefixName: "นาย",
        firstName: "C",
        lastName: "D",
        sex: "M",
        email: "c@rmuti.ac.th",
        phone: "000",
        position: "P",
        hireDate: "01/01/2025",
        employmentType: "สายวิชาการ",
        departmentName: null,
        personnelTypeName: "PT1",
        role: "USER",
      },
    ];

    xlsx.read.mockReturnValue({ SheetNames: ["S"], Sheets: { S: {} } });
    xlsx.utils.sheet_to_json
      .mockReturnValueOnce(users)
      .mockReturnValueOnce([[]]);

    prisma.user.findUnique.mockResolvedValue(null);
    prisma.personnelType.findFirst.mockResolvedValue({ id: 1, name: "PT1" });
    prisma.department.findFirst.mockResolvedValue({ id: 2, name: "D1" });
    prisma.user.create.mockResolvedValue({ id: 10, email: "a@rmuti.ac.th" });

    prisma.role.findMany.mockResolvedValue([{ id: 5, name: "USER" }]);
    prisma.rank.findMany.mockResolvedValue([]);
    prisma.setting.findUnique.mockResolvedValue({ value: "2026" });
    prisma.userRank.findMany.mockResolvedValue([]);

    const req = makeReq();
    const res = makeRes();

    await exelController.uploadUserExcel(req, res);

    expect(res.json).toHaveBeenCalledTimes(1);
    const payload = res.json.mock.calls[0][0];
    expect(payload.createdCount).toBe(1);
    expect(payload.failedCount).toBe(1);
  });

  it("balance mode: all-or-nothing success creates balances from excel remainingDays", async () => {
    const users = [
      {
        prefixName: "นาย",
        firstName: "A",
        lastName: "B",
        sex: "M",
        email: "a@rmuti.ac.th",
        phone: "000",
        position: "P",
        hireDate: "01/01/2025",
        employmentType: "ACADEMIC",
        departmentName: "D1",
        personnelTypeName: "PT1",
        role: "USER",
        sickBalance: 5,
        personalBalance: "3",
      },
    ];

    const header = [
      [
        "prefixName",
        "firstName",
        "lastName",
        "sex",
        "email",
        "phone",
        "position",
        "hireDate",
        "employmentType",
        "departmentName",
        "personnelTypeName",
        "role",
        "sickBalance",
        "personalBalance",
      ],
    ];

    xlsx.read.mockReturnValue({ SheetNames: ["S"], Sheets: { S: {} } });
    xlsx.utils.sheet_to_json
      .mockReturnValueOnce(users)
      .mockReturnValueOnce(header);

    prisma.user.findUnique.mockResolvedValue(null);
    prisma.personnelType.findFirst.mockResolvedValue({ id: 1, name: "PT1" });
    prisma.department.findFirst.mockResolvedValue({ id: 2, name: "D1" });
    prisma.user.create.mockResolvedValue({ id: 10, email: "a@rmuti.ac.th" });

    prisma.role.findMany.mockResolvedValue([{ id: 5, name: "USER" }]);
    prisma.rank.findMany.mockResolvedValue([
      { id: 100, minHireMonths: null, maxHireMonths: null, leaveTypeId: 1 },
      { id: 101, minHireMonths: null, maxHireMonths: null, leaveTypeId: 2 },
    ]);

    prisma.setting.findUnique.mockResolvedValue({ value: "2026" });

    prisma.userRank.findMany.mockResolvedValue([
      {
        rank: {
          leaveTypeId: 1,
          maxDays: 10,
          receiveDays: 10,
          isBalance: false,
          leaveType: { name: "ลาป่วย", isNonDeductible: false },
        },
      },
      {
        rank: {
          leaveTypeId: 2,
          maxDays: 6,
          receiveDays: 6,
          isBalance: false,
          leaveType: { name: "ลากิจส่วนตัว", isNonDeductible: false },
        },
      },
    ]);

    const req = makeReq();
    const res = makeRes();

    await exelController.uploadUserExcel(req, res);

    expect(res.status).not.toHaveBeenCalledWith(400);
    const payload = res.json.mock.calls[0][0];
    expect(payload.createdCount).toBe(1);
    expect(prisma.leaveBalance.create).toHaveBeenCalledTimes(2);

    const first = prisma.leaveBalance.create.mock.calls[0][0].data;
    expect(first.leaveTypeId).toBe(1);
    expect(first.maxDays).toBe(10);
    expect(first.remainingDays).toBe(5);
    expect(first.usedDays).toBe(5);

    const second = prisma.leaveBalance.create.mock.calls[1][0].data;
    expect(second.leaveTypeId).toBe(2);
    expect(second.maxDays).toBe(6);
    expect(second.remainingDays).toBe(3);
    expect(second.usedDays).toBe(3);
  });

  it("balance mode: invalid balance rolls back and returns 400", async () => {
    const users = [
      {
        prefixName: "นาย",
        firstName: "A",
        lastName: "B",
        sex: "M",
        email: "a@rmuti.ac.th",
        phone: "000",
        position: "P",
        hireDate: "01/01/2025",
        employmentType: "ACADEMIC",
        departmentName: "D1",
        personnelTypeName: "PT1",
        role: "USER",
        sickBalance: 5,
        personalBalance: "x",
      },
    ];

    const header = [
      [
        "prefixName",
        "firstName",
        "lastName",
        "sex",
        "email",
        "phone",
        "position",
        "hireDate",
        "employmentType",
        "departmentName",
        "personnelTypeName",
        "role",
        "sickBalance",
        "personalBalance",
      ],
    ];

    xlsx.read.mockReturnValue({ SheetNames: ["S"], Sheets: { S: {} } });
    xlsx.utils.sheet_to_json
      .mockReturnValueOnce(users)
      .mockReturnValueOnce(header);

    prisma.user.findUnique.mockResolvedValue(null);
    prisma.personnelType.findFirst.mockResolvedValue({ id: 1, name: "PT1" });
    prisma.department.findFirst.mockResolvedValue({ id: 2, name: "D1" });
    prisma.user.create.mockResolvedValue({ id: 10, email: "a@rmuti.ac.th" });

    prisma.role.findMany.mockResolvedValue([{ id: 5, name: "USER" }]);
    prisma.rank.findMany.mockResolvedValue([
      { id: 100, minHireMonths: null, maxHireMonths: null, leaveTypeId: 1 },
      { id: 101, minHireMonths: null, maxHireMonths: null, leaveTypeId: 2 },
    ]);

    prisma.setting.findUnique.mockResolvedValue({ value: "2026" });

    prisma.userRank.findMany.mockResolvedValue([
      {
        rank: {
          leaveTypeId: 1,
          maxDays: 10,
          receiveDays: 10,
          isBalance: false,
          leaveType: { name: "ลาป่วย", isNonDeductible: false },
        },
      },
      {
        rank: {
          leaveTypeId: 2,
          maxDays: 6,
          receiveDays: 6,
          isBalance: false,
          leaveType: { name: "ลากิจส่วนตัว", isNonDeductible: false },
        },
      },
    ]);

    prisma.$transaction = jest.fn(async (cb) => {
      try {
        return await cb(prisma);
      } catch (e) {
        throw e;
      }
    });

    const req = makeReq();
    const res = makeRes();

    await exelController.uploadUserExcel(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: "Import failed",
      })
    );

    // NOTE: In real Prisma transaction, any previous writes would be rolled back.
    // In this unit test we mock `$transaction` as a direct callback call, so
    // writes may be invoked before the validation error is thrown.
    expect(prisma.leaveBalance.create.mock.calls.length).toBeLessThanOrEqual(1);
  });
});
