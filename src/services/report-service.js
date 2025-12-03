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

  static async getReportData(organizationId, startDate, endDate) {
    // 1. ดึง personnel type ทั้งหมด
    const personnelTypes = await prisma.personnelType.findMany({
      select: { id: true, name: true },
    });

    // 2. ดึง user ทั้งหมดใน org + personnelType
    const users = await prisma.user.findMany({
      where: {
        department: {
          organizationId: Number(organizationId),
        },
      },
      select: {
        id: true,
        prefixName: true,
        firstName: true,
        lastName: true,
        email: true,
        personnelType: { select: { id: true, name: true } },
        LeaveRequest: {
          where: {
            status: "APPROVED",
            // ✅ เงื่อนไขแบบ "ทับบางส่วน"
            startDate: { lte: new Date(endDate) },
            endDate: { gte: new Date(startDate) },
          },
          select: {
            id: true,
            leaveType: { select: { id: true, name: true } },
            totalDays: true,
            startDate: true,
            endDate: true,
          },
        },
      },
    });

    // 3. เตรียม object โดยใส่ personnelType ทุกตัวไว้ก่อน
    const grouped = {};
    personnelTypes.forEach((pt) => {
      grouped[pt.name] = [];
    });

    // 4. เติมข้อมูล user ลงใน group ที่ตรงกับ personnelType
    users.forEach((user) => {
      const typeName = user.personnelType?.name || "ไม่ระบุประเภท";

      const summary = {};
      user.LeaveRequest.forEach((lr) => {
        const leaveTypeName = lr.leaveType.name;
        if (!summary[leaveTypeName]) {
          summary[leaveTypeName] = { count: 0, days: 0 };
        }
        summary[leaveTypeName].count += 1;
        summary[leaveTypeName].days += lr.totalDays;
      });

      if (!grouped[typeName]) {
        grouped[typeName] = [];
      }

      grouped[typeName].push({
        userId: user.id,
        name: `${user.prefixName} ${user.firstName} ${user.lastName}`,
        email: user.email,
        leaveSummary: summary,
      });
    });

    return grouped;
  }

  static async downloadReport(userId) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        department: {
          include: {
            organization: true,
          },
        },
      },
    });

    return user;
  }
}

module.exports = ReportService;
