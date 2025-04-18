const prisma = require("../config/prisma");
const dayjs = require("dayjs");

class RankService {
    // ดึง rank ที่ตรงกับเงื่อนไขอายุงาน และ personnelType ของ user
    static async getRankForUser(user) {
        const personnelTypeId = user.personnelTypeId;
        const hireDate = dayjs(user.hireDate);
        const today = dayjs();
        const monthsSinceHire = today.diff(hireDate, "month");

        return await prisma.rank.findFirst({
            where: {
                personnelTypeId,
                minHireMonths: { lte: monthsSinceHire },
                OR: [
                    { maxHireMonths: null },
                    { maxHireMonths: { gte: monthsSinceHire }},
                ],
            },
            orderBy: { minHireMonths: "desc" },
        });
    }

    // ดึง rank ทั้งหมด (admin)
    static async getAllRanks() {
        return await prisma.rank.findMany({
            include: { personnelType: true },
            orderBy: { minHireMonths: "asc" },
        });
    }

    // ดึง rank by id
    static async getRankById(id) {
        return await prisma.rank.findUnique({
            where: { id },
            include: { personnelType: true },
        });
    }

    // create new rank
    static async createRank(data) {
        return await prisma.rank.create({ data });
    }

    // update rank
    static async updateRank(id, data) {
        return await prisma.rank.update({
            where: { id },
            data,
        });
    }

    // delete rank
    static async deleteRank(id) {
        return await prisma.rank.delete({
            where: { id },
        });
    }
}

module.exports = RankService;