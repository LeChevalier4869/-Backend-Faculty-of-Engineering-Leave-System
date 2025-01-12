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
      where: { id: Number(id) },
    });

    if (!leaveType) {
      throw createError(404, `Leave type with ID ${id} not found`);
    }

    return await prisma.leaveTypes.update({
      where: { id: Number(id) },
      data: updates,
    });
  }

  static async deleteLeaveType(id) {
    const leaveType = await prisma.leaveTypes.findUnique({
      where: { id: Number(id) },
    });
    if (!leaveType) {
      throw createError(404, `Leave type with ID ${id} not found`);
    }

    return await prisma.leaveTypes.delete({
      where: { id: Number(id) },
    });
  }

  static async getAllLeaveTypes() {
    return await prisma.leaveTypes.findMany();
  }

  static async getLeaveTypeByID(id) {
    if (isNaN(id)) {
      throw createError(400, `Invalid leave type ID: ${id}`);
    }
    const leaveType = await prisma.leaveTypes.findUnique({
      where: { id: Number(id) },
    });
    if (!leaveType) {
      throw createError(404, `Leave type with ID ${id} not found`);
    }
    return leaveType;
  }
}

module.exports = LeaveTypeService;
