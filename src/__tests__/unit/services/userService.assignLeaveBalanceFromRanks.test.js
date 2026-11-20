jest.mock("../../../config/prisma", () => ({
  setting: { findUnique: jest.fn() },
  rank: { findMany: jest.fn() },
  userRank: { findMany: jest.fn() },
  leaveBalance: { create: jest.fn() },
  user: { findUnique: jest.fn() },
}));

const prisma = require("../../../config/prisma");
const UserService = require("../../../services/user-service");

describe("UserService.assignLeaveBalanceFromRanks", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    prisma.setting.findUnique.mockResolvedValue({ value: "2026" });
    prisma.leaveBalance.create.mockResolvedValue({});
  });

  it("uses entered remaining balances and used counts while blank values keep defaults", async () => {
    prisma.userRank.findMany.mockResolvedValue([
      {
        rank: {
          leaveTypeId: 1,
          maxDays: 15,
          receiveDays: 10,
          leaveType: { name: "ลาป่วย", isNonDeductible: false },
        },
      },
      {
        rank: {
          leaveTypeId: 2,
          maxDays: 0,
          receiveDays: 0,
          leaveType: { name: "ลาไปประกอบพิธีฮัจย์", isNonDeductible: true },
        },
      },
      {
        rank: {
          leaveTypeId: 3,
          maxDays: 30,
          receiveDays: 20,
          leaveType: { name: "ลากิจส่วนตัว", isNonDeductible: false },
        },
      },
      {
        rank: {
          leaveTypeId: 4,
          maxDays: 0,
          receiveDays: 0,
          leaveType: { name: "ลาไปราชการ", isNonDeductible: true },
        },
      },
    ]);

    const warnings = await UserService.assignLeaveBalanceFromRanks(
      42,
      "ชาย",
      { 1: 8, 2: 5, 3: "", 4: "" },
    );

    expect(warnings).toEqual([]);
    expect(prisma.leaveBalance.create.mock.calls.map(([{ data }]) => data)).toEqual([
      {
        userId: 42,
        leaveTypeId: 1,
        maxDays: 15,
        usedDays: 7,
        pendingDays: 0,
        remainingDays: 8,
        year: 2026,
      },
      {
        userId: 42,
        leaveTypeId: 2,
        maxDays: 0,
        usedDays: 5,
        pendingDays: 0,
        remainingDays: 0,
        year: 2026,
      },
      {
        userId: 42,
        leaveTypeId: 3,
        maxDays: 30,
        usedDays: 0,
        pendingDays: 0,
        remainingDays: 20,
        year: 2026,
      },
      {
        userId: 42,
        leaveTypeId: 4,
        maxDays: 0,
        usedDays: 0,
        pendingDays: 0,
        remainingDays: 0,
        year: 2026,
      },
    ]);
  });

  it("keeps the default and returns a warning when a remaining balance exceeds maxDays", async () => {
    prisma.userRank.findMany.mockResolvedValue([
      {
        rank: {
          leaveTypeId: 1,
          maxDays: 15,
          receiveDays: 10,
          leaveType: { name: "ลาป่วย", isNonDeductible: false },
        },
      },
    ]);

    const warnings = await UserService.assignLeaveBalanceFromRanks(
      42,
      "ชาย",
      { 1: 16 },
    );

    expect(prisma.leaveBalance.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        remainingDays: 10,
        usedDays: 0,
      }),
    });
    expect(warnings).toEqual([
      expect.stringContaining("ยอดคงเหลือ 16 วันเกินสิทธิ์สูงสุด 15 วัน"),
    ]);
  });

  it("returns only leave options applicable to the employee's tenure and sex", async () => {
    prisma.rank.findMany.mockResolvedValue([
      {
        leaveTypeId: 1,
        minHireMonths: null,
        maxHireMonths: null,
        maxDays: 15,
        receiveDays: 10,
        leaveType: { name: "ลาป่วย", isNonDeductible: false },
      },
      {
        leaveTypeId: 2,
        minHireMonths: null,
        maxHireMonths: null,
        maxDays: 90,
        receiveDays: 90,
        leaveType: { name: "ลาคลอดบุตร", isNonDeductible: false },
      },
    ]);

    const options = await UserService.getLeaveBalanceOptions(
      3,
      new Date("2000-01-01T00:00:00"),
      "ชาย",
    );

    expect(prisma.rank.findMany).toHaveBeenCalledWith({
      where: { personnelTypeId: 3 },
      include: { leaveType: true },
    });
    expect(options).toEqual([
      {
        leaveTypeId: 1,
        name: "ลาป่วย",
        maxDays: 15,
        receiveDays: 10,
        defaultDays: 10,
        isNonDeductible: false,
      },
    ]);
  });

  it("includes the user's organization with the department in user-info data", async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 42,
      department: {
        id: 5,
        name: "วิศวกรรมคอมพิวเตอร์",
        organization: { id: 2, name: "คณะวิศวกรรมศาสตร์" },
      },
    });

    await UserService.getUserInfoById(42);

    expect(prisma.user.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 42 },
        include: expect.objectContaining({
          department: { include: { organization: true } },
        }),
      }),
    );
  });
});
