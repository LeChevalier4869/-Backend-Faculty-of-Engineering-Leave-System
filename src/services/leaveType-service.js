const prisma = require("../config/prisma");
const createError = require("../utils/createError");

// class LeaveTypeService {
//   static async createLeaveType(name, conditions) {
//     const existingLeaveType = await prisma.leavetypes.findUnique({
//       where: { name },
//     });
//     if (existingLeaveType) {
//       throw createError(400, `Leave type ${name} already exists`);
//     }
//     return await prisma.leavetypes.create({
//       data: { name, conditions },
//     });
//   }

//   static async updateLeaveType(id, updates) {
//     const leaveType = await prisma.leavetypes.findUnique({
//       where: { id: Number(id) },
//     });

//     if (!leaveType) {
//       throw createError(404, `Leave type with ID ${id} not found`);
//     }

//     return await prisma.leavetypes.update({
//       where: { id: Number(id) },
//       data: updates,
//     });
//   }

//   static async deleteLeaveType(id) {
//     const leaveType = await prisma.leavetypes.findUnique({
//       where: { id: Number(id) },
//     });
//     if (!leaveType) {
//       throw createError(404, `Leave type with ID ${id} not found`);
//     }

//     return await prisma.leavetypes.delete({
//       where: { id: Number(id) },
//     });
//   }

//   static async getAllLeaveTypes() {
//     return await prisma.leavetypes.findMany();
//   }

//   static async getLeaveTypeByID(id) {
//     if (isNaN(id)) {
//       throw createError(400, `Invalid leave type ID: ${id}`);
//     }
//     const leaveType = await prisma.leavetypes.findUnique({
//       where: { id: Number(id) },
//     });
//     if (!leaveType) {
//       throw createError(404, `Leave type with ID ${id} not found`);
//     }
//     return leaveType;
//   }
// }

// module.exports = LeaveTypeService;

//---------------new-----------------------


const getAllLeaveTypes = async () => {
  return await prisma.leavetypes.findMany();
};

const getLeaveTypeById = async (id) => {
  return await prisma.leavetypes.findUnique({ where: { id } });
};

const createLeaveType = async (data) => {
  return await prisma.leavetypes.create({ data });
};

const updateLeaveType = async (id, data) => {
  return await prisma.leavetypes.update({
    where: { id },
    data,
  });
};

const deleteLeaveType = async (id) => {
  return await prisma.leavetypes.delete({ where: { id } });
};

module.exports = {
  getAllLeaveTypes,
  getLeaveTypeById,
  createLeaveType,
  updateLeaveType,
  deleteLeaveType,
};
