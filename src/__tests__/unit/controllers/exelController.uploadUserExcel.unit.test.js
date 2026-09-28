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
  user: { id: 1 },
  ip: "127.0.0.1",
  get: jest.fn().mockReturnValue("jest-test-agent"),
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
    if (!prisma.userPositionNumber) prisma.userPositionNumber = {};
    if (!prisma.auditLog) prisma.auditLog = {};

    prisma.userPositionNumber.findFirst = jest.fn().mockResolvedValue(null);
    prisma.userPositionNumber.deleteMany = jest.fn().mockResolvedValue({ count: 0 });
    prisma.userPositionNumber.update = jest.fn().mockResolvedValue({});
    prisma.userPositionNumber.create = jest.fn().mockResolvedValue({ id: 1 });
    prisma.auditLog.create = jest.fn().mockResolvedValue({ id: 1 });

    prisma.user.findUnique = jest.fn();
    prisma.user.create = jest.fn();

    prisma.personnelType.findFirst = jest.fn();
    prisma.department.findFirst = jest.fn();
    prisma.department.findMany = jest.fn().mockResolvedValue([]);

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
        positionNumber: "ENG-001",
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
        positionNumber: "ENG-002",
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

  it("non-deductible leave type stores paper value as usedDays (no deduction)", async () => {
    const users = [
      {
        prefixName: "นาย",
        firstName: "A",
        lastName: "B",
        sex: "M",
        email: "a@rmuti.ac.th",
        phone: "000",
        position: "P",
        positionNumber: "ENG-009",
        hireDate: "01/01/2025",
        employmentType: "ACADEMIC",
        departmentName: "D1",
        personnelTypeName: "PT1",
        role: "USER",
        sickBalance: 8, // deductible (คงเหลือ)
        "ลาบวช": 7, // non-deductible (วันที่ใช้ไปแล้ว)
      },
    ];

    const header = [
      ["prefixName", "firstName", "lastName", "email", "sickBalance", "ลาบวช"],
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
      { id: 105, minHireMonths: null, maxHireMonths: null, leaveTypeId: 5 },
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
          leaveTypeId: 5,
          maxDays: 90,
          receiveDays: 0,
          isBalance: true,
          leaveType: { name: "ลาอุปสมบท", isNonDeductible: true },
        },
      },
    ]);

    const req = makeReq();
    const res = makeRes();

    await exelController.uploadUserExcel(req, res);

    expect(prisma.leaveBalance.create).toHaveBeenCalledTimes(2);

    // deductible: ลาป่วย -> คงเหลือจาก paper = 8, used = 2
    const sick = prisma.leaveBalance.create.mock.calls[0][0].data;
    expect(sick.leaveTypeId).toBe(1);
    expect(sick.maxDays).toBe(10);
    expect(sick.remainingDays).toBe(8);
    expect(sick.usedDays).toBe(2);

    // non-deductible: ลาอุปสมบท -> เก็บ usedDays = 7, maxDays/remaining = 0
    const ordination = prisma.leaveBalance.create.mock.calls[1][0].data;
    expect(ordination.leaveTypeId).toBe(5);
    expect(ordination.maxDays).toBe(0);
    expect(ordination.remainingDays).toBe(0);
    expect(ordination.usedDays).toBe(7);
  });

  it("maps template balance headers to the correct leave type (study/research/assistWife/official no collision)", async () => {
    const users = [
      {
        prefixName: "นาย",
        firstName: "A",
        lastName: "B",
        email: "a@rmuti.ac.th",
        phone: "000",
        position: "P",
        positionNumber: "ENG-777",
        hireDate: "01/01/2020",
        employmentType: "ACADEMIC",
        departmentName: "D1",
        personnelTypeName: "PT1",
        role: "USER",
        // หัวคอลัมน์ตรงกับ template จริง (ต้อง exact-match กับ alias ใน controller)
        "ลาป่วย (วันคงเหลือ)": 8,
        "ลาไปศึกษา (วันคงเหลือ)": 15,
        "ลาฝึกอบรม/วิจัย/ดูงาน (วันคงเหลือ)": 25,
        "ลาช่วยเหลือภริยาที่คลอดบุตร (วันคงเหลือ)": 3,
        "ไปราชการ (วันที่ใช้ไปแล้ว)": 7,
      },
    ];
    const header = [Object.keys(users[0])];

    xlsx.read.mockReturnValue({ SheetNames: ["S"], Sheets: { S: {} } });
    xlsx.utils.sheet_to_json.mockReturnValueOnce(users).mockReturnValueOnce(header);

    prisma.user.findUnique.mockResolvedValue(null);
    prisma.personnelType.findFirst.mockResolvedValue({ id: 1, name: "PT1" });
    prisma.department.findFirst.mockResolvedValue({ id: 2, name: "D1" });
    prisma.user.create.mockResolvedValue({ id: 10, email: "a@rmuti.ac.th" });
    prisma.role.findMany.mockResolvedValue([{ id: 5, name: "USER" }]);
    prisma.rank.findMany.mockResolvedValue([
      { id: 1, minHireMonths: null, maxHireMonths: null, leaveTypeId: 1 },
      { id: 7, minHireMonths: null, maxHireMonths: null, leaveTypeId: 7 },
      { id: 14, minHireMonths: null, maxHireMonths: null, leaveTypeId: 14 },
      { id: 8, minHireMonths: null, maxHireMonths: null, leaveTypeId: 8 },
      { id: 15, minHireMonths: null, maxHireMonths: null, leaveTypeId: 15 },
    ]);
    prisma.setting.findUnique.mockResolvedValue({ value: "2026" });
    prisma.userRank.findMany.mockResolvedValue([
      { rank: { leaveTypeId: 1, maxDays: 10, receiveDays: 10, isBalance: false, leaveType: { name: "ลาป่วย", isNonDeductible: false } } },
      { rank: { leaveTypeId: 7, maxDays: 20, receiveDays: 20, isBalance: false, leaveType: { name: "ลาไปศึกษา", isNonDeductible: false } } },
      { rank: { leaveTypeId: 14, maxDays: 30, receiveDays: 30, isBalance: false, leaveType: { name: "ลาไปฝึกอบรม ปฏิบัติการวิจัย หรือดูงาน", isNonDeductible: false } } },
      { rank: { leaveTypeId: 8, maxDays: 15, receiveDays: 15, isBalance: false, leaveType: { name: "ลาไปช่วยเหลือภริยาที่คลอดบุตร", isNonDeductible: false } } },
      { rank: { leaveTypeId: 15, maxDays: 0, receiveDays: 0, isBalance: true, leaveType: { name: "ไปราชการ", isNonDeductible: true } } },
    ]);

    const req = makeReq();
    const res = makeRes();

    await exelController.uploadUserExcel(req, res);

    const byType = {};
    for (const call of prisma.leaveBalance.create.mock.calls) {
      byType[call[0].data.leaveTypeId] = call[0].data;
    }

    // ลาป่วย (control): คงเหลือ 8 -> used 2
    expect(byType[1]).toMatchObject({ maxDays: 10, remainingDays: 8, usedDays: 2 });
    // ลาไปศึกษา (study) ต้องอ่านค่า 15 ของตัวเอง ไม่ใช่ 25 ของ research
    expect(byType[7]).toMatchObject({ maxDays: 20, remainingDays: 15, usedDays: 5 });
    // research ต้องอ่านค่า 25 ของตัวเอง ไม่ใช่ 15 ของ study
    expect(byType[14]).toMatchObject({ maxDays: 30, remainingDays: 25, usedDays: 5 });
    // ช่วยเหลือภริยา (assistWife) ต้องอ่านค่า 3 ของตัวเอง ไม่ถูกจับเป็นลาคลอด
    expect(byType[8]).toMatchObject({ maxDays: 15, remainingDays: 3, usedDays: 12 });
    // ไปราชการ (non-deductible) เก็บเป็น usedDays = 7
    expect(byType[15]).toMatchObject({ maxDays: 0, remainingDays: 0, usedDays: 7 });
  });

  it("matches department leniently when exact name not found (unambiguous contains)", async () => {
    const users = [
      {
        prefixName: "นาย",
        firstName: "A",
        lastName: "B",
        sex: "M",
        email: "a@rmuti.ac.th",
        phone: "000",
        position: "P",
        positionNumber: "ENG-010",
        hireDate: "01/01/2025",
        employmentType: "SUPPORT",
        departmentName: "คอมพิวเตอร์", // ชื่อย่อ ไม่ตรงเป๊ะ
        personnelTypeName: "PT1",
        role: "USER",
      },
    ];

    xlsx.read.mockReturnValue({ SheetNames: ["S"], Sheets: { S: {} } });
    xlsx.utils.sheet_to_json.mockReturnValueOnce(users).mockReturnValueOnce([[]]);

    prisma.user.findUnique.mockResolvedValue(null);
    prisma.personnelType.findFirst.mockResolvedValue({ id: 1, name: "PT1" });
    // หาเป๊ะไม่เจอ -> ต้อง fallback ไป findMany
    prisma.department.findFirst.mockResolvedValue(null);
    prisma.department.findMany.mockResolvedValue([
      { id: 2, name: "วิศวกรรมโยธา" },
      { id: 4, name: "วิศวกรรมคอมพิวเตอร์" },
      { id: 11, name: "เคมี" },
    ]);
    prisma.user.create.mockResolvedValue({ id: 10, email: "a@rmuti.ac.th" });
    prisma.role.findMany.mockResolvedValue([{ id: 5, name: "USER" }]);
    prisma.rank.findMany.mockResolvedValue([]);
    prisma.setting.findUnique.mockResolvedValue({ value: "2026" });
    prisma.userRank.findMany.mockResolvedValue([]);

    const req = makeReq();
    const res = makeRes();

    await exelController.uploadUserExcel(req, res);

    const payload = res.json.mock.calls[0][0];
    expect(payload.createdCount).toBe(1);
    expect(payload.failedCount).toBe(0);
    // สร้าง user ด้วย departmentId 4 (วิศวกรรมคอมพิวเตอร์)
    expect(prisma.user.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ departmentId: 4 }),
    });
  });

  it("rejects ambiguous department match with helpful error", async () => {
    const users = [
      {
        prefixName: "นาย",
        firstName: "A",
        lastName: "B",
        sex: "M",
        email: "a@rmuti.ac.th",
        phone: "000",
        position: "P",
        positionNumber: "ENG-011",
        hireDate: "01/01/2025",
        employmentType: "SUPPORT",
        departmentName: "วิศวกรรม", // กำกวม ตรงหลายสาขา
        personnelTypeName: "PT1",
        role: "USER",
      },
    ];

    xlsx.read.mockReturnValue({ SheetNames: ["S"], Sheets: { S: {} } });
    xlsx.utils.sheet_to_json.mockReturnValueOnce(users).mockReturnValueOnce([[]]);

    prisma.user.findUnique.mockResolvedValue(null);
    prisma.personnelType.findFirst.mockResolvedValue({ id: 1, name: "PT1" });
    prisma.department.findFirst.mockResolvedValue(null);
    prisma.department.findMany.mockResolvedValue([
      { id: 2, name: "วิศวกรรมโยธา" },
      { id: 4, name: "วิศวกรรมคอมพิวเตอร์" },
    ]);
    prisma.role.findMany.mockResolvedValue([{ id: 5, name: "USER" }]);
    prisma.setting.findUnique.mockResolvedValue({ value: "2026" });

    const req = makeReq();
    const res = makeRes();

    await exelController.uploadUserExcel(req, res);

    const payload = res.json.mock.calls[0][0];
    expect(payload.createdCount).toBe(0);
    expect(payload.failedCount).toBe(1);
    expect(payload.failedUsers[0].reason).toContain("ตรงกับหลายสาขา");
    expect(prisma.user.create).not.toHaveBeenCalled();
  });
});
