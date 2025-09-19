const prisma = require("../config/prisma");

class ReportService {
  static async getLeaveSummary() {
    const groups = await prisma.leaveRequest.groupBy({
      by: ["userId"],
      where: { status: "APPROVED" },
      _sum: { thisTimeDays: true },
    });

    const userIds = groups.map((g) => g.userId);
    const users = await prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, prefixName: true, firstName: true, lastName: true },
    });

    return groups.map((g) => {
      const u = users.find((u) => u.id === g.userId);
      const name = u
        ? `${u.prefixName}${u.firstName} ${u.lastName}`
        : "Unknown";
      return {
        userId: g.userId,
        name,
        totalDays: g._sum.thisTimeDays || 0,
      };
    });
  }

  // static async getReportData(userId) {
  //   return prisma.leaveRequest.findMany({
  //     where: { userId: Number(userId) },
  //     include: { user: true },
  //   });
  // }
  // static async updateReportData(userId) {
  //   return prisma.leaveRequest.findMany({
  //     where: { userId: Number(userId) },
  //     include: { user: true },
  //   });
  // }
  // mock service ดึงข้อมูลรายงาน (จริงๆ จะไป query จาก Prisma หรือ DB)
  static async getReportData(userId) {
    return [
      { date: "2025-09-01", type: "SICK", days: 5, remark: "เป็นไข้" },
      {
        date: "2025-09-05",
        type: "VACATION",
        days: 2,
        remark: "ไปต่างจังหวัด",
      },
    ];
  }
  static async getOrganizationLeaveReport(organizationId) {
    // ดึง user ทั้งหมดใน org
    const users = await prisma.user.findMany({
      where: {
        department: {
          organizationId: Number(organizationId),
        },
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        LeaveRequest: {
          where: { status: "APPROVED" },
          select: {
            id: true,
            leaveType: { select: { id: true, name: true } },
            totalDays: true,
          },
        },
      },
    });

    // สร้าง summary ต่อ user
    return users.map((user) => {
      const summary = {};
      user.LeaveRequest.forEach((lr) => {
        const typeName = lr.leaveType.name;
        if (!summary[typeName]) {
          summary[typeName] = { count: 0, days: 0 };
        }
        summary[typeName].count += 1;
        summary[typeName].days += lr.totalDays;
      });

      return {
        userId: user.id,
        name: `${user.firstName} ${user.lastName}`,
        email: user.email,
        leaveSummary: summary,
      };
    });
  }

}

module.exports = ReportService;
