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
    const numID = Number(id);
    if (isNaN(numID)) {
      throw createError(400, 'Invalid ID provided');
    }
    const leaveType = await prisma.leaveTypes.findUnique({
      where: { id: numID },
    });
    if (!leaveType) {
      throw createError(404, `Leave type with ID ${numID} not found`);
    }

    return await prisma.leaveTypes.update({
      where: { id: numID },
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

  static async getAllLeaveTypes() {
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
