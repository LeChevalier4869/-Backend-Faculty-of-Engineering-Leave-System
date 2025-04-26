const prisma = require("../config/prisma");
const createError = require("../utils/createError");

class RankService {
  // ดึง Rank ที่ตรงกับเงื่อนไขอายุงาน และ PersonnelType ของ user
  static async getRankForUser(user, leaveTypeId) {
    if (!user.hireDate || !user.personnelTypeId || !leaveTypeId) {
      return null;
    }

    const months = calculateMonths(user.hireDate);

    const rank = await prisma.Rank.findFirst({
      where: {
        personnelTypeId: user.personnelTypeId,
        leaveTypeId: leaveTypeId,
        minHireMonths: { lte: months },
        maxHireMonths: { gte: months },
      },
    });

    return rank;
  }

  // ดึง Rank ทั้งหมด (admin)
  static async getAllRanks() {
    return await prisma.Rank.findMany({
      include: { PersonnelType: true }, // เปลี่ยน personnelType เป็น PersonnelType
      orderBy: { minHireMonths: "asc" },
    });
  }

  // ดึง Rank by id
  static async getRankById(id) {
    return await prisma.Rank.findUnique({
      where: { id },
      include: { PersonnelType: true }, // เปลี่ยน personnelType เป็น PersonnelType
    });
  }

  // create new Rank
  static async createRank(data) {
    return await prisma.Rank.create({ data });
  }

  // update Rank
  static async updateRank(id, data) {
    const exists = await prisma.Rank.findUnique({ where: { id } });
    if (!exists) throw createError(404, `ไม่พบ Rank id ${id}`);

    return await prisma.Rank.update({
      where: { id },
      data,
    });
  }

  // delete Rank
  static async deleteRank(id) {
    return await prisma.Rank.delete({
      where: { id },
    });
  }

  static async getRankForUserByLeaveType(user, leaveTypeId) {
    console.log("Debug user.id:", user.id);
    const userRank = await prisma.UserRank.findFirst({
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
}

function calculateMonths(hireDate) {
  const now = new Date();
  const hire = new Date(hireDate);
  let months = (now.getFullYear() - hire.getFullYear()) * 12;
  months += now.getMonth() - hire.getMonth();
  if (now.getDate() < hire.getDate()) {
    months--;
  }
  return months;
}

module.exports = RankService;