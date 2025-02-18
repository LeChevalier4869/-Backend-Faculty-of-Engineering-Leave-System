const prisma = require("../config/prisma");
const createError = require("../utils/createError");

class RoleAssignmentService {
  // ตั้งค่า Role ให้ User ในวันนั้น (มี upsert)
  static async setAssignment(userId, role, date = new Date()) {
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);

    const assignment = await prisma.daily_role_assignments.upsert({
      where: {
        date_role_unique: { date: startOfDay, role },
      },
      update: { userId },
      create: { role, userId, date: startOfDay },
    });

    return assignment;
  }

  // ดึง Role รายวัน
  static async getAssignments(date = new Date()) {
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);

    return await prisma.daily_role_assignments.findMany({
      where: { date: startOfDay },
      include: { users: true },
    });
  }

  // ลบบทบาทรายวัน
  static async deleteAssignment(role, date) {
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);

    const assignment = await prisma.daily_role_assignments.findFirst({
      where: { role, date: startOfDay },
    });

    if (!assignment) {
      throw createError(404, "ไม่พบข้อมูลบทบาทที่ต้องการลบ");
    }

    await prisma.daily_role_assignments.delete({
      where: { id: assignment.id },
    });
  }
}

module.exports = RoleAssignmentService;
