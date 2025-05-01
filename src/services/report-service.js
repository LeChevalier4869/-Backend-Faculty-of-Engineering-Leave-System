const prisma = require('../config/prisma');

class ReportService {
  static async getLeaveSummary() {
    const groups = await prisma.leaveRequest.groupBy({
      by: ['userId'],
      where: { status: 'APPROVED' },
      _sum: { thisTimeDays: true },
    });

    const userIds = groups.map(g => g.userId);
    const users = await prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, prefixName: true, firstName: true, lastName: true },
    });

    return groups.map(g => {
      const u = users.find(u => u.id === g.userId);
      const name = u
        ? `${u.prefixName}${u.firstName} ${u.lastName}`
        : 'Unknown';
      return {
        userId: g.userId,
        name,
        totalDays: g._sum.thisTimeDays || 0,
      };
    });
  }
}

module.exports = ReportService;
