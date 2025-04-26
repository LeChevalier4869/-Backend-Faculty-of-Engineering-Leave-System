const prisma = require("../config/prisma");
const createError = require("../utils/createError");

class LeaveTypeService {
  // สร้างประเภทการลา
  static async createLeaveType({ name, isAvailable = true }) {
    if (!name) {
      throw createError(400, "ต้องระบุชื่อประเภทการลา");
    }

    const existing = await prisma.LeaveType.findFirst({ // เปลี่ยน leaveType เป็น LeaveType
      where: { name },
    });

    if (existing) {
      throw createError(409, "ประเภทนี้มีอยู่ในระบบแล้ว");
    }

    return await prisma.LeaveType.create({ // เปลี่ยน leaveType เป็น LeaveType
      data: { name, isAvailable },
    });
  }

  // แก้ไขประเภทการลา
  static async updateLeaveType(id, updateData) {
    return await prisma.LeaveType.update({ // เปลี่ยน leaveType เป็น LeaveType
      where: { id },
      data: updateData,
    });
  }

  // ลบประเภทการลา
  static async deleteLeaveType(id) {
    return await prisma.LeaveType.delete({ // เปลี่ยน leaveType เป็น LeaveType
      where: { id },
    });
  }

  // ดึงข้อมูลประเภทการลาทั้งหมด
  static async getAllLeaveType() {
    return await prisma.LeaveType.findMany({ // เปลี่ยน leaveType เป็น LeaveType
      orderBy: { name: "asc" },
    });
  }

  // ดึงประเภทการลาตาม ID
  static async getLeaveTypeById(id) {
    return await prisma.LeaveType.findUnique({ // เปลี่ยน leaveType เป็น LeaveType
      where: { id },
    });
  }
}

module.exports = LeaveTypeService;