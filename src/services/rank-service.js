const prisma = require("../config/prisma");
const createError = require("../utils/createError");

class RankService {
  // ดึง Rank ทั้งหมด (admin)
  static async getAllRanks() {
    return await prisma.rank.findMany({
      include: { personnelType: true, leaveType: true },
      orderBy: [{ leaveTypeId: "asc" }, { personnelTypeId: "asc" }, { minHireMonths: "asc" }],
    });
  }

  // ดึง Rank by id
  static async getRankById(id) {
    return await prisma.rank.findUnique({
      where: { id },
      include: { personnelType: true, leaveType: true },
    });
  }

  // create new Rank
  static async createRank(data) {
    return await prisma.rank.create({ data });
  }

  // update Rank
  static async updateRank(id, data) {
    const exists = await prisma.rank.findUnique({ where: { id } });
    if (!exists) throw createError(404, `ไม่พบ Rank id ${id}`);

    return await prisma.rank.update({
      where: { id },
      data,
    });
  }

  // delete Rank
  static async deleteRank(id) {
    // กันลบ rank ที่มีผู้ใช้ผูกอยู่ (FK) แล้วขึ้น error งง ๆ
    const inUse = await prisma.userRank.count({ where: { rankId: id } });
    if (inUse > 0) {
      throw createError(
        400,
        `ไม่สามารถลบเงื่อนไขวันลานี้ได้ เนื่องจากมีผู้ใช้ ${inUse} คนผูกกับเงื่อนไขนี้อยู่`
      );
    }
    return await prisma.rank.delete({
      where: { id },
    });
  }

  static async getRankForUserByLeaveType(user, leaveTypeId) {
    const userRank = await prisma.userRank.findFirst({
      where: {
        userId: user.id,
        rank: {
          personnelTypeId: user.personnelTypeId,
          leaveTypeId: leaveTypeId,
        },
      },
      include: {
        rank: true,
      },
    });

    return userRank?.rank || null;
  }

  // หา rank ที่ช่วงอายุงานทับซ้อนกัน ภายใน personnelType + leaveType เดียวกัน
  // (null = ไม่จำกัด: min=null -> -∞, max=null -> +∞) ใช้ตอน create/update กันสร้างซ้อน
  static async findOverlappingRank({
    personnelTypeId,
    leaveTypeId,
    minHireMonths,
    maxHireMonths,
    excludeId = null,
  }) {
    const siblings = await prisma.rank.findMany({
      where: {
        personnelTypeId,
        leaveTypeId,
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
    });

    const newMin = minHireMonths ?? -Infinity;
    const newMax = maxHireMonths ?? Infinity;

    return (
      siblings.find((r) => {
        const exMin = r.minHireMonths ?? -Infinity;
        const exMax = r.maxHireMonths ?? Infinity;
        // ทับซ้อนเมื่อ newMin <= exMax && exMin <= newMax
        return newMin <= exMax && exMin <= newMax;
      }) || null
    );
  }
}

module.exports = RankService;