const prisma = require("../config/prisma");
const createError = require("../utils/createError");

class LeaveTypeService {
  // สร้างประเภทการลา
  static async createLeaveType({ name, isAvailable = true }) {
    if (!name) {
      throw createError(400, "ต้องระบุชื่อประเภทการลา");
    }

    const existing = await prisma.leaveType.findFirst({
      where: { name },
    });

    if (existing) {
      throw createError(409, "ประเภทนี้มีอยู่ในระบบแล้ว");
    }

    return await prisma.leaveType.create({
      data: { name, isAvailable },
    });
  }

  //แก้ไขประเภทการลา
  static async updateLeaveType(id, updateData) {
    return await prisma.leaveType.update({
      where: { id },
      data: updateData,
    });
  }

  //ลบประเภทการลา
  static async deleteLeaveType(id) {
    return await prisma.leaveType.delete({
      where: { id },
    });
  }

  //ดึงข้อมูลทั้งหมด
  static async getAllLeaveType() {
    return await prisma.leaveType.findMany({
      orderBy: { name: "asc" },
    });
  }

  //ดึงประเภทการลาตาม ID
  static async getLeaveTypeById(id) {
    return await prisma.leaveType.findUnique({
      where: { id },
    });
  }
}

module.exports = LeaveTypeService;