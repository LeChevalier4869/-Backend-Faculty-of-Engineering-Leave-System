const prisma = require("../config/prisma");
const createError = require("../utils/createError");

class LeaveTypeService {
  static async createLeaveType(name, maxDays, conditions) {
    const existingLeaveType = await prisma.leaveTypes.findUnique({
      where: { name },
    });
    if (existingLeaveType) {
      throw createError(400, `Leave type ${name} already exists`);
    }
    return await prisma.leaveTypes.create({
      data: { name, maxDays, conditions },
    });
  }

  static async updateLeaveType(id, updates) {
    const leaveType = await prisma.leaveTypes.findUnique({
      where: { id },
    });
    if (!leaveType) {
      throw createError(404, `Leave type with ID ${id} not found`);
    }

    return await prisma.leaveTypes.update({
      where: { id },
      data: updates,
    });
  }

  static async deleteLeaveType(id) {
    const leaveType = await prisma.leaveTypes.findUnique({
      where: { id },
    });
    if (!leaveType) {
      throw createError(404, `Leave type with ID ${id} not found`);
    }

    return await prisma.leaveTypes.delete({
      where: { id },
    });
  }

  static async getAllLeaveType() {
    return await prisma.leaveTypes.findMany();
  }

  static async getLeaveTypeByID(id) {
    const leaveType = await prisma.leaveTypes.findUnique({
      where: { id },
    });
    if (!leaveType) {
      throw createError(404, `Leave type with ID ${id} not found`);
    }
    return leaveType;
  }
}

module.exports = LeaveTypeService;
