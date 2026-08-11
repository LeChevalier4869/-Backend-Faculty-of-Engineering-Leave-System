const prisma = require("../config/prisma");
const {
  startOfMonth,
  endOfMonth,
  getDaysInMonth,
  eachDayOfInterval,
  isWithinInterval,
  isWeekend,
} = require("date-fns");

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
      select: {
        id: true,
        prefixName: true,
        firstName: true,
        lastName: true,
        positionNumbers: {
          where: { isCurrent: true },
          select: {
            positionNumber: true,
            effectiveFrom: true,
          },
        },
      },
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

  /**
   * ช่วงวันที่ของรอบปีงบประมาณปัจจุบัน — อ่านจาก setting "fiscalYear" (เก็บเป็น ค.ศ.)
   * ปีงบ ค.ศ. N = 1 ต.ค. (N-1) ถึง 30 ก.ย. N. คืน BE ไว้แสดงหัวรายงานด้วย
   */
  static async getFiscalRange() {
    const setting = await prisma.setting.findUnique({
      where: { key: "fiscalYear" },
    });
    const fyCE = setting ? parseInt(setting.value, 10) : new Date().getFullYear();
    return {
      startDate: `${fyCE - 1}-10-01`,
      endDate: `${fyCE}-09-30T23:59:59.999`,
      fiscalYearCE: fyCE,
      fiscalYearBE: fyCE + 543,
    };
  }

  static async getReportData(organizationId, startDate, endDate) {
    const winStart = new Date(startDate);
    const winEnd = new Date(endDate);

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
        positionNumbers: {
          where: { isCurrent: true },
          select: {
            positionNumber: true,
            effectiveFrom: true,
          },
        },
        email: true,
        personnelType: { select: { id: true, name: true } },
        LeaveRequest: {
          where: {
            status: "APPROVED",
            // ✅ เงื่อนไขแบบ "ทับบางส่วน"
            startDate: { lte: winEnd },
            endDate: { gte: winStart },
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
        const leaveTypeName = lr.leaveType?.name;
        if (!leaveTypeName) return;
        if (!summary[leaveTypeName]) {
          summary[leaveTypeName] = { count: 0, days: 0 };
        }
        // นับเฉพาะจำนวนวันที่คาบเกี่ยวอยู่ในช่วงรายงาน (prorate ตามสัดส่วนวันปฏิทิน)
        summary[leaveTypeName].count += 1;
        summary[leaveTypeName].days += ReportService.daysWithinWindow(
          lr.startDate,
          lr.endDate,
          lr.totalDays,
          winStart,
          winEnd,
        );
      });

      // ปัดเศษ .days กันค่าทศนิยมลอย (floating point)
      Object.values(summary).forEach((s) => {
        s.days = Math.round(s.days * 100) / 100;
      });

      if (!grouped[typeName]) {
        grouped[typeName] = [];
      }

      grouped[typeName].push({
        userId: user.id,
        positionNo: user.positionNumbers?.[0]?.positionNumber || "",
        name: `${user.prefixName ?? ""}${user.firstName} ${user.lastName}`.trim(),
        email: user.email,
        leaveSummary: summary,
      });
    });

    return grouped;
  }

  /**
   * จำนวนวันลาที่ตกอยู่ในช่วง [winStart, winEnd] — prorate totalDays ตามสัดส่วน
   * วันปฏิทินที่คาบเกี่ยว (ถ้าใบลาอยู่ในช่วงทั้งหมด → คืน totalDays เต็ม)
   */
  static daysWithinWindow(start, end, totalDays, winStart, winEnd) {
    const DAY = 86400000;
    const atMidnight = (d) => {
      const x = new Date(d);
      x.setHours(0, 0, 0, 0);
      return x.getTime();
    };
    const ls = atMidnight(start);
    const le = atMidnight(end);
    const ws = atMidnight(winStart);
    const we = atMidnight(winEnd);

    const oStart = Math.max(ls, ws);
    const oEnd = Math.min(le, we);
    if (oEnd < oStart) return 0; // ไม่คาบเกี่ยว

    const spanDays = Math.floor((le - ls) / DAY) + 1;
    const overlapDays = Math.floor((oEnd - oStart) / DAY) + 1;
    if (spanDays <= 0) return totalDays || 0;
    if (overlapDays >= spanDays) return totalDays || 0; // อยู่ในช่วงทั้งหมด

    return Math.round(((totalDays || 0) * overlapDays) / spanDays * 100) / 100;
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
        personnelType: true,
        positionNumbers: {
          where: { isCurrent: true },
          select: {
            positionNumber: true,
            effectiveFrom: true,
          },
        },
      },
    });
    return user;
  }

  static async getReportDataForMonth(organizationId, month, year) {
    const referenceDate = new Date(year, month - 1, 1);
    const startDateMonth = startOfMonth(referenceDate);
    const endDateMonth = endOfMonth(referenceDate);
    const daysInMonth = getDaysInMonth(referenceDate);

    const personnelTypes = await prisma.personnelType.findMany({
      select: { id: true, name: true },
    });

    const users = await prisma.user.findMany({
      where: {
        department: { organizationId: Number(organizationId) },
      },
      select: {
        id: true,
        prefixName: true,
        firstName: true,
        lastName: true,
        personnelType: { select: { name: true } },
        LeaveRequest: {
          where: {
            status: "APPROVED",
            startDate: { lte: endDateMonth },
            endDate: { gte: startDateMonth },
          },
          select: {
            leaveTypeId: true,
            startDate: true,
            endDate: true,
          },
        },
      },
    });

    const grouped = {};
    personnelTypes.forEach((pt) => {
      grouped[pt.name] = [];
    });

    const allDays = eachDayOfInterval({
      start: startDateMonth,
      end: endDateMonth,
    });

    const LEAVE_KEY = {
      1: "SICK", // ลาป่วย
      2: "MATERNITY", // ลาคลอดบุตร
      3: "PERSONAL", // ลากิจส่วนตัว
      4: "ANNUAL", // ลาพักผ่อน
      5: "ORDINATION", // ลาอุปสมบท
      6: "MILITARY", // ลาเข้ารับการตรวจเลือกเข้ารับการเตรียมพล
      7: "STUDY", // ลาไปศึกษา ฝึกอบรม วิจัย ดูงาน
      8: "PATERNITY", // ลาไปช่วยเหลือภริยาที่คลอดบุตร
      9: "REHABILITATION", // ลาไปฟื้นฟูสมรรถภาพด้านอาชีพ
      10: "DHARMA", // ลาไปถือศีล ปฏิบัติธรรม
      11: "INTERNATIONAL_WORK", // ลาไปปฏิบัติงานในองค์การระหว่างประเทศ
      12: "FOLLOW_SPOUSE", // ลาติดตามคู่สมรส
      13: "HAJJ", // ลาไปประกอบพิธีฮัจย์
    };

    users.forEach((user) => {
      const typeName = user.personnelType?.name || "ไม่ระบุประเภท";
      const attendance = {};
      let actualWorkDaysCount = 0;

      allDays.forEach((date) => {
        const dayKey = date.getDate();
        const isDayWeekend = isWeekend(date);

        const matchLeave = user.LeaveRequest.find((lr) =>
          isWithinInterval(date, {
            start: new Date(lr.startDate).setHours(0, 0, 0, 0),
            end: new Date(lr.endDate).setHours(23, 59, 59, 999),
          }),
        );

        if (matchLeave) {
          attendance[dayKey] = LEAVE_KEY[matchLeave.leaveTypeId] ?? "UNKNOWN";
        } else if (!isDayWeekend) {
          actualWorkDaysCount++;
        }
      });

      grouped[typeName].push({
        userId: user.id,
        name: `${user.prefixName ?? ""}${user.firstName} ${user.lastName}`,
        attendance,
        totalWorkDays: actualWorkDaysCount,
      });
    });

    return { organizationId, month, year, daysInMonth, report: grouped };
  }
}
module.exports = ReportService;
