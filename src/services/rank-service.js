const prisma = require("../config/prisma");

class RankService {

    /**
     * คืนค่า Rank ที่ตรงกับอายุงานของผู้ใช้งาน
     * @param {Object} user - user object ที่มี hireDate และ personnelTypeId
     * @returns {Promise<Rank|null>}
     */

    // ดึง rank ที่ตรงกับเงื่อนไขอายุงาน และ personnelType ของ user
    static async getRankForUser(user) {
        if (!user?.hireDate || !user.personnelTypeId) return null;

        const months = calculateMonths(user.hireDate);

        const rank = await prisma.rank.findFirst({
            where: {
                personnelTypeId: user.personnelTypeId,
                minHireMonths: { lte: months },
                maxHireMonths: { gte: months },
            },
        });
        return rank;
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

/**
 * คำนวณจำนวนเดือนตั้งแต่ hireDate จนถึงวันนี้
 * @param {Date} hireDate
 * @returns {number}
 */
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