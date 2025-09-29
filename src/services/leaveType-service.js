const prisma = require("../config/prisma");
const createError = require("../utils/createError");

class LeaveTypeService {
  // สร้างประเภทการลา
  static async createLeaveType({ name, isAvailable = true }) {
    console.log("Creating LeaveType with name:", name);
    if (!name) {
      throw createError(400, "ต้องระบุชื่อประเภทการลา");
    }


    const existing = await prisma.leaveType.findFirst({ // เปลี่ยน leaveType เป็น LeaveType
      where: { name },
    });

    if (existing) {
      throw createError(409, "ประเภทนี้มีอยู่ในระบบแล้ว");
    }

    return await prisma.leaveType.create({ // เปลี่ยน leaveType เป็น LeaveType
      data: { name, isAvailable },
    });
  }

  // แก้ไขประเภทการลา
  static async updateLeaveType(id, updateData) {
    return await prisma.leaveType.update({ // เปลี่ยน leaveType เป็น LeaveType
      where: { id },
      data: updateData,
    });
  }

  // ลบประเภทการลา
  static async deleteLeaveType(id) {
    return await prisma.leaveType.delete({ // เปลี่ยน leaveType เป็น LeaveType
      where: { id },
    });
  }

  // ดึงข้อมูลประเภทการลาทั้งหมด
  static async getAllLeaveType() {
    return await prisma.leaveType.findMany({ // เปลี่ยน leaveType เป็น LeaveType
      orderBy: { id: "asc" },
    });
  }

  // ดึงประเภทการลาตาม ID
  static async getLeaveTypeById(id) {
    return await prisma.leaveType.findUnique({ // เปลี่ยน leaveType เป็น LeaveType
      where: { id },
    });
  }

  
  // ดึงประเภทการลาที่ลาในระบบได้
  static async getAvailableLeaveTypes() {
    try {
      return await prisma.leaveType.findMany({
        where: {
          isAvailable: true,
        },
      });
    } catch (error) {
      console.error('Error in getAvailableLeaveTypes:', error);
      throw error;
    }
  }

}

module.exports = LeaveTypeService;