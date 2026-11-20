jest.mock("../../../config/prisma", () => ({
  setting: { findUnique: jest.fn() },
  organization: { findMany: jest.fn() },
  department: { findMany: jest.fn() },
  rank: { findMany: jest.fn() },
  user: { findMany: jest.fn() },
  userRank: { findMany: jest.fn() },
  leaveBalance: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  $transaction: jest.fn(),
}));

const prisma = require("../../../config/prisma");
const LeaveBalanceManagementService = require("../../../services/leaveBalanceManagement-service");

const tx = {
  setting: { findUnique: jest.fn() },
  user: { findMany: jest.fn() },
  userRank: { findMany: jest.fn() },
  leaveBalance: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  auditLog: { create: jest.fn() },
};

const actor = { id: 8, ipAddress: "127.0.0.1", userAgent: "test" };

function makeUser(id = 12) {
  return {
    id,
    prefixName: "นาย",
    firstName: `User${id}`,
    lastName: "Test",
    sex: "ชาย",
    personnelTypeId: 3,
    hireDate: new Date("2010-01-01T00:00:00.000Z"),
  };
}

function makeBalance(user = makeUser()) {
  return {
    id: user.id + 100,
    userId: user.id,
    leaveTypeId: 1,
    year: 2027,
    maxDays: 15,
    remainingDays: 8,
    usedDays: 4,
    pendingDays: 3,
    user,
    leaveType: {
      id: 1,
      name: "ลาป่วย",
      isNonDeductible: false,
      resetOnFiscalYear: true,
    },
  };
}

function makeRank(user = makeUser(), maxDays = 15, leaveType = {}) {
  return {
    id: user.id + 200,
    leaveTypeId: 1,
    personnelTypeId: user.personnelTypeId,
    minHireMonths: null,
    maxHireMonths: null,
    maxDays,
    receiveDays: maxDays,
    isBalance: false,
    leaveType: {
      id: 1,
      name: "ลาป่วย",
      isNonDeductible: false,
      ...leaveType,
    },
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  prisma.$transaction.mockImplementation((callback) => callback(tx));
  tx.leaveBalance.findFirst.mockResolvedValue(null);
  tx.leaveBalance.update.mockImplementation(async ({ where, data }) => ({
    id: where.id,
    ...data,
  }));
  tx.auditLog.create.mockResolvedValue({});
});

describe("LeaveBalanceManagementService.getUsers", () => {
  it("returns all users when no filters are given", async () => {
    prisma.setting.findUnique.mockResolvedValue({ value: "2027" });
    prisma.user.findMany.mockResolvedValue([
      {
        ...makeUser(),
        department: null,
        personnelType: null,
        userRanks: [],
        leaveBalances: [],
      },
    ]);

    const result = await LeaveBalanceManagementService.getUsers();

    expect(prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: {} }),
    );
    expect(result.users.map((user) => user.id)).toEqual([12]);
  });

  it("returns current-year balances with the same carry-over allowance used by validation", async () => {
    prisma.setting.findUnique.mockResolvedValue({ value: "2027" });
    const user = {
      ...makeUser(),
      department: null,
      personnelType: null,
      userRanks: [],
      leaveBalances: [
        {
          ...makeBalance(),
          year: 2027,
          leaveTypeId: 4,
          leaveType: {
            id: 4,
            name: "ลาพักผ่อน",
            isNonDeductible: false,
            resetOnFiscalYear: true,
          },
        },
        {
          id: 900,
          userId: 12,
          leaveTypeId: 4,
          year: 2026,
          maxDays: 12,
          remainingDays: 10,
          usedDays: 8,
          pendingDays: 0,
          leaveType: {
            id: 4,
            name: "ลาพักผ่อน",
            isNonDeductible: false,
            resetOnFiscalYear: true,
          },
        },
      ],
    };
    prisma.user.findMany.mockResolvedValue([user]);

    const result = await LeaveBalanceManagementService.getUsers({ search: "User12" });

    expect(prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        include: expect.objectContaining({
          leaveBalances: expect.objectContaining({
            where: { year: { in: [2027, 2026] } },
          }),
        }),
      }),
    );
    expect(result.users[0].leaveBalances).toHaveLength(1);
    expect(result.users[0].leaveBalances[0].carryOverDays).toBe(4);
  });
});

describe("LeaveBalanceManagementService.initializeMissingBalances", () => {
  it("creates only missing eligible balances from Rank defaults and writes audit logs", async () => {
    const user = {
      ...makeUser(),
      userRanks: [
        {
          rank: {
            ...makeRank(makeUser(), 15),
            id: 211,
            receiveDays: 12,
            leaveType: {
              id: 1,
              name: "ลาป่วย",
              isNonDeductible: false,
              resetOnFiscalYear: true,
            },
          },
        },
        {
          rank: {
            ...makeRank(makeUser(), 6),
            id: 212,
            leaveTypeId: 2,
            receiveDays: 5,
            leaveType: {
              id: 2,
              name: "ลากิจ",
              isNonDeductible: false,
              resetOnFiscalYear: true,
            },
          },
        },
      ],
      leaveBalances: [
        {
          id: 701,
          userId: 12,
          leaveTypeId: 1,
          year: 2027,
          remainingDays: 12,
          usedDays: 3,
          pendingDays: 0,
          maxDays: 15,
        },
      ],
    };
    tx.setting.findUnique.mockResolvedValue({ value: "2027" });
    tx.user.findMany.mockResolvedValue([user]);
    tx.leaveBalance.create.mockImplementation(async ({ data }) => ({
      id: 702,
      ...data,
    }));

    const result = await LeaveBalanceManagementService.initializeMissingBalances(
      [user.id],
      actor,
    );

    expect(prisma.$transaction).toHaveBeenCalledWith(
      expect.any(Function),
      { maxWait: 10000, timeout: 60000 },
    );
    expect(tx.leaveBalance.create).toHaveBeenCalledTimes(1);
    expect(tx.leaveBalance.create).toHaveBeenCalledWith({
      data: {
        userId: user.id,
        leaveTypeId: 2,
        maxDays: 6,
        usedDays: 0,
        pendingDays: 0,
        remainingDays: 5,
        year: 2027,
      },
      include: { leaveType: true },
    });
    expect(result.createdCount).toBe(1);
    expect(tx.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "LEAVE_BALANCE_INITIALIZE",
        entityType: "LeaveBalance",
        entityId: 702,
        details: `สร้าง LeaveBalance (user ${user.id}, leaveType 2, rank 212, year 2027)`,
        entityData: expect.stringContaining('"rankId":212'),
      }),
    });
    expect(
      tx.auditLog.create.mock.calls[0][0].data.details.length,
    ).toBeLessThanOrEqual(191);
  });

  it("skips a gender-restricted leave type when it is not allowed for the user", async () => {
    const user = {
      ...makeUser(),
      userRanks: [
        {
          rank: {
            ...makeRank(makeUser(), 90),
            id: 211,
            leaveType: {
              id: 1,
              name: "ลาคลอดบุตร",
              isNonDeductible: false,
              resetOnFiscalYear: false,
            },
          },
        },
      ],
      leaveBalances: [],
    };
    tx.setting.findUnique.mockResolvedValue({ value: "2027" });
    tx.user.findMany.mockResolvedValue([user]);

    const result = await LeaveBalanceManagementService.initializeMissingBalances(
      [user.id],
      actor,
    );

    expect(tx.leaveBalance.create).not.toHaveBeenCalled();
    expect(result.createdCount).toBe(0);
    expect(result.skipped[0].reason).toContain("ไม่พบ Rank ที่ใช้ได้");
  });

  it("carries forward a permanent non-deductible leave balance without resetting totals", async () => {
    const user = {
      ...makeUser(),
      userRanks: [
        {
          rank: {
            ...makeRank(makeUser(), 0),
            id: 215,
            leaveTypeId: 5,
            receiveDays: 0,
            isBalance: true,
            leaveType: {
              id: 5,
              name: "ลาไปประกอบพิธีฮัจย์",
              isNonDeductible: true,
              resetOnFiscalYear: false,
            },
          },
        },
      ],
      leaveBalances: [],
    };
    tx.setting.findUnique.mockResolvedValue({ value: "2027" });
    tx.user.findMany.mockResolvedValue([user]);
    tx.leaveBalance.findFirst.mockImplementation(async ({ orderBy }) =>
      orderBy
        ? {
            maxDays: 0,
            usedDays: 4,
            pendingDays: 0,
            remainingDays: 1,
            year: 2026,
          }
        : null,
    );
    tx.leaveBalance.create.mockImplementation(async ({ data }) => ({
      id: 705,
      ...data,
    }));

    await LeaveBalanceManagementService.initializeMissingBalances([user.id], actor);

    expect(tx.leaveBalance.create).toHaveBeenCalledWith({
      data: {
        userId: user.id,
        leaveTypeId: 5,
        maxDays: 0,
        usedDays: 4,
        pendingDays: 0,
        remainingDays: 1,
        year: 2027,
      },
      include: { leaveType: true },
    });
  });

  it("does not create new-year balances for non-reset deductible leave types", async () => {
    const user = {
      ...makeUser(),
      userRanks: [
        {
          rank: {
            ...makeRank(makeUser(), 5),
            id: 216,
            leaveTypeId: 7,
            leaveType: {
              id: 7,
              name: "ลาบางประเภท",
              isNonDeductible: false,
              resetOnFiscalYear: false,
            },
          },
        },
      ],
      leaveBalances: [],
    };
    tx.setting.findUnique.mockResolvedValue({ value: "2027" });
    tx.user.findMany.mockResolvedValue([user]);

    const result = await LeaveBalanceManagementService.initializeMissingBalances(
      [user.id],
      actor,
    );

    expect(tx.leaveBalance.create).not.toHaveBeenCalled();
    expect(result.skipped[0].reason).toContain("ไม่มีการสร้างยอดใหม่ตามรอบปี");
  });

  it("adds eligible prior-year vacation carry-over when creating the missing fiscal-year balance", async () => {
    const user = {
      ...makeUser(),
      userRanks: [
        {
          rank: {
            ...makeRank(makeUser(), 10),
            id: 217,
            leaveTypeId: 4,
            leaveType: {
              id: 4,
              name: "ลาพักผ่อน",
              isNonDeductible: false,
              resetOnFiscalYear: true,
            },
          },
        },
      ],
      leaveBalances: [
        {
          id: 706,
          userId: 12,
          leaveTypeId: 4,
          year: 2026,
          maxDays: 10,
          remainingDays: 5,
          usedDays: 3,
          pendingDays: 0,
          leaveType: {
            id: 4,
            name: "ลาพักผ่อน",
            isNonDeductible: false,
            resetOnFiscalYear: true,
          },
        },
      ],
    };
    tx.setting.findUnique.mockResolvedValue({ value: "2027" });
    tx.user.findMany.mockResolvedValue([user]);
    tx.leaveBalance.findFirst.mockResolvedValue({
      remainingDays: 5,
      maxDays: 10,
      usedDays: 3,
    });
    tx.leaveBalance.create.mockImplementation(async ({ data }) => ({
      id: 707,
      ...data,
    }));

    await LeaveBalanceManagementService.initializeMissingBalances([user.id], actor);

    expect(tx.leaveBalance.create).toHaveBeenCalledWith({
      data: {
        userId: user.id,
        leaveTypeId: 4,
        maxDays: 10,
        usedDays: 0,
        pendingDays: 0,
        remainingDays: 15,
        year: 2027,
      },
      include: { leaveType: true },
    });
  });
});

describe("LeaveBalanceManagementService.adjustOne", () => {
  it("updates remaining and used days while preserving pending days", async () => {
    const user = makeUser();
    const balance = makeBalance(user);
    tx.leaveBalance.findUnique.mockResolvedValue(balance);
    tx.userRank.findMany.mockResolvedValue([
      { rank: makeRank(user) },
    ]);

    await LeaveBalanceManagementService.adjustOne(
      balance.id,
      { remainingDays: 7, usedDays: 5 },
      user.id + 200,
      actor,
    );

    expect(tx.leaveBalance.update).toHaveBeenCalledWith({
      where: { id: balance.id },
      data: { remainingDays: 7, usedDays: 5 },
    });
    expect(tx.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: actor.id,
        action: "LEAVE_BALANCE_MANUAL_ADJUST",
        entityType: "LeaveBalance",
        entityId: balance.id,
        entityData: expect.stringContaining('"userId":12'),
      }),
    });
  });

  it("rejects totals above the user's rank limit without updating the record", async () => {
    const user = makeUser();
    const balance = makeBalance(user);
    tx.leaveBalance.findUnique.mockResolvedValue(balance);
    tx.userRank.findMany.mockResolvedValue([
      { rank: makeRank(user, 15) },
    ]);

    await expect(
      LeaveBalanceManagementService.adjustOne(
        balance.id,
        { remainingDays: 10, usedDays: 5 },
        user.id + 200,
        actor,
      ),
    ).rejects.toThrow("เกินสิทธิ์ตาม Rank 15 วัน");

    expect(tx.leaveBalance.update).not.toHaveBeenCalled();
    expect(tx.auditLog.create).not.toHaveBeenCalled();
  });

  it("rejects a rank without a configured maximum instead of treating it as zero", async () => {
    const user = makeUser();
    const balance = { ...makeBalance(user), pendingDays: 0 };
    tx.leaveBalance.findUnique.mockResolvedValue(balance);
    tx.userRank.findMany.mockResolvedValue([
      { rank: makeRank(user, null) },
    ]);

    await expect(
      LeaveBalanceManagementService.adjustOne(
        balance.id,
        { remainingDays: 0, usedDays: 0 },
        user.id + 200,
        actor,
      ),
    ).rejects.toThrow("ไม่ได้กำหนดสิทธิ์วันลาสูงสุด");

    expect(tx.leaveBalance.update).not.toHaveBeenCalled();
  });

  it("allows count-only leave to update used days but keeps remaining at zero", async () => {
    const user = makeUser();
    const balance = {
      ...makeBalance(user),
      leaveTypeId: 2,
      maxDays: 0,
      remainingDays: 0,
      leaveType: {
        id: 2,
        name: "ลาไปประกอบพิธีฮัจย์",
        isNonDeductible: true,
        resetOnFiscalYear: false,
      },
    };
    const rank = {
      ...makeRank(user, 0, {
        id: 2,
        name: "ลาไปประกอบพิธีฮัจย์",
        isNonDeductible: true,
      }),
      leaveTypeId: 2,
    };
    tx.leaveBalance.findUnique.mockResolvedValue(balance);
    tx.userRank.findMany.mockResolvedValue([{ rank }]);

    await LeaveBalanceManagementService.adjustOne(
      balance.id,
      { remainingDays: 0, usedDays: 6 },
      rank.id,
      actor,
    );

    expect(tx.leaveBalance.update).toHaveBeenCalledWith({
      where: { id: balance.id },
      data: { remainingDays: 0, usedDays: 6 },
    });
  });
});

describe("LeaveBalanceManagementService.adjustMany", () => {
  it("validates every selected user's rank before writing any balance", async () => {
    const userA = makeUser(12);
    const userB = makeUser(13);
    const balanceA = makeBalance(userA);
    const balanceB = { ...makeBalance(userB), pendingDays: 4 };
    tx.setting.findUnique.mockResolvedValue({ value: "2027" });
    tx.user.findMany.mockResolvedValue([
      { ...userA, userRanks: [], leaveBalances: [balanceA] },
      { ...userB, userRanks: [], leaveBalances: [balanceB] },
    ]);
    tx.userRank.findMany.mockImplementation(async ({ where }) => [
      { rank: makeRank(where.userId === userA.id ? userA : userB) },
    ]);

    await expect(
      LeaveBalanceManagementService.adjustMany(
        {
          userIds: [userA.id, userB.id],
          leaveTypeId: 1,
          remainingDays: 10,
          usedDays: 5,
        },
        actor,
      ),
    ).rejects.toThrow("ไม่สามารถปรับยอดได้");

    expect(tx.leaveBalance.update).not.toHaveBeenCalled();
  });
});

describe("LeaveBalanceManagementService.adjustBalances", () => {
  it("rejects all balance changes before writing when one entry exceeds its rank", async () => {
    const userA = makeUser(12);
    const userB = makeUser(13);
    const balanceA = makeBalance(userA);
    const balanceB = makeBalance(userB);
    tx.leaveBalance.findUnique.mockImplementation(async ({ where }) =>
      where.id === balanceA.id ? balanceA : balanceB,
    );
    tx.userRank.findMany.mockImplementation(async ({ where }) => [
      { rank: makeRank(where.userId === userA.id ? userA : userB) },
    ]);

    await expect(
      LeaveBalanceManagementService.adjustBalances(
        [
          {
            balanceId: balanceA.id,
            rankId: userA.id + 200,
            remainingDays: 6,
            usedDays: 6,
          },
          {
            balanceId: balanceB.id,
            rankId: userB.id + 200,
            remainingDays: 10,
            usedDays: 5,
          },
        ],
        actor,
      ),
    ).rejects.toThrow("ไม่สามารถบันทึกยอดได้");

    expect(tx.leaveBalance.update).not.toHaveBeenCalled();
    expect(tx.auditLog.create).not.toHaveBeenCalled();
  });

  it("updates different balances together and audits each user/type with before and after values", async () => {
    const userA = makeUser(12);
    const userB = makeUser(13);
    const balanceA = makeBalance(userA);
    const balanceB = makeBalance(userB);
    tx.leaveBalance.findUnique.mockImplementation(async ({ where }) =>
      where.id === balanceA.id ? balanceA : balanceB,
    );
    tx.userRank.findMany.mockImplementation(async ({ where }) => [
      { rank: makeRank(where.userId === userA.id ? userA : userB) },
    ]);

    const result = await LeaveBalanceManagementService.adjustBalances(
      [
        {
          balanceId: balanceA.id,
          rankId: userA.id + 200,
          remainingDays: 6,
          usedDays: 6,
        },
        {
          balanceId: balanceB.id,
          rankId: userB.id + 200,
          remainingDays: 5,
          usedDays: 6,
        },
      ],
      actor,
    );

    expect(result.updatedCount).toBe(2);
    expect(tx.leaveBalance.update).toHaveBeenCalledTimes(2);
    expect(tx.auditLog.create).toHaveBeenCalledTimes(2);
    const auditData = tx.auditLog.create.mock.calls.map(([call]) =>
      JSON.parse(call.data.entityData),
    );
    expect(auditData).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          balanceId: balanceA.id,
          userId: userA.id,
          leaveTypeId: balanceA.leaveTypeId,
          oldData: expect.objectContaining({ remainingDays: 8, usedDays: 4 }),
          newData: expect.objectContaining({ remainingDays: 6, usedDays: 6 }),
        }),
        expect.objectContaining({
          balanceId: balanceB.id,
          userId: userB.id,
          leaveTypeId: balanceB.leaveTypeId,
          oldData: expect.objectContaining({ remainingDays: 8, usedDays: 4 }),
          newData: expect.objectContaining({ remainingDays: 5, usedDays: 6 }),
        }),
      ]),
    );
  });
});
