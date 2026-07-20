jest.mock("../../../config/prisma", () => ({
  rank: { findMany: jest.fn(), delete: jest.fn() },
  userRank: { count: jest.fn() },
}));

const prisma = require("../../../config/prisma");
const RankService = require("../../../services/rank-service");

beforeEach(() => jest.clearAllMocks());

describe("RankService.findOverlappingRank", () => {
  const args = { personnelTypeId: 2, leaveTypeId: 3, minHireMonths: 0, maxHireMonths: 12 };

  it("คืน null เมื่อไม่มี rank อื่นในกลุ่มเดียวกัน", async () => {
    prisma.rank.findMany.mockResolvedValue([]);
    expect(await RankService.findOverlappingRank(args)).toBeNull();
  });

  it("เจอทับซ้อนเมื่อช่วงคาบเกี่ยวกัน", async () => {
    prisma.rank.findMany.mockResolvedValue([
      { id: 9, rank: "เดิม", minHireMonths: 6, maxHireMonths: 24 },
    ]);
    const r = await RankService.findOverlappingRank(args); // [0,12] vs [6,24]
    expect(r).toMatchObject({ id: 9 });
  });

  it("ไม่ทับซ้อนเมื่อช่วงไม่คาบเกี่ยว", async () => {
    prisma.rank.findMany.mockResolvedValue([
      { id: 9, rank: "เดิม", minHireMonths: 13, maxHireMonths: 24 },
    ]);
    expect(await RankService.findOverlappingRank(args)).toBeNull(); // [0,12] vs [13,24]
  });

  it("ถือว่า null เป็นช่วงไม่จำกัด (ทับซ้อนเสมอ)", async () => {
    prisma.rank.findMany.mockResolvedValue([
      { id: 9, rank: "เดิม", minHireMonths: null, maxHireMonths: null },
    ]);
    const r = await RankService.findOverlappingRank(args);
    expect(r).toMatchObject({ id: 9 });
  });

  it("ส่ง excludeId เพื่อไม่นับตัวเองตอน update", async () => {
    prisma.rank.findMany.mockResolvedValue([]);
    await RankService.findOverlappingRank({ ...args, excludeId: 5 });
    expect(prisma.rank.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: { not: 5 } }),
      })
    );
  });
});

describe("RankService.deleteRank", () => {
  it("โยน error เมื่อมีผู้ใช้ผูกกับ rank อยู่ (ไม่ลบ)", async () => {
    prisma.userRank.count.mockResolvedValue(3);
    await expect(RankService.deleteRank(5)).rejects.toMatchObject({
      statusCode: 400,
    });
    expect(prisma.rank.delete).not.toHaveBeenCalled();
  });

  it("ลบได้เมื่อไม่มีผู้ใช้ผูกอยู่", async () => {
    prisma.userRank.count.mockResolvedValue(0);
    prisma.rank.delete.mockResolvedValue({ id: 5 });
    await RankService.deleteRank(5);
    expect(prisma.rank.delete).toHaveBeenCalledWith({ where: { id: 5 } });
  });
});
