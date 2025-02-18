const RoleAssignmentService = require("../services/roleAssignment-service");
const createError = require("../utils/createError");

exports.setAssignment = async (req, res, next) => {
  try {
    const { userId, role, date } = req.body;
    if (!userId || !role) {
      throw createError(400, "ต้องระบุ userId และ role");
    }

    const assignment = await RoleAssignmentService.setAssignment(userId, role, date);
    res.status(201).json({ message: "กำหนดบทบาทสำเร็จ", data: assignment });
  } catch (err) {
    next(err);
  }
};

exports.getAssignments = async (req, res, next) => {
  try {
    const { date } = req.query;
    const assignments = await RoleAssignmentService.getAssignments(date);
    res.status(200).json({ message: "ดึงบทบาทสำเร็จ", data: assignments });
  } catch (err) {
    next(err);
  }
};

exports.deleteAssignment = async (req, res, next) => {
  try {
    const { role, date } = req.body;
    if (!role || !date) {
      throw createError(400, "ต้องระบุ role และ date");
    }

    await RoleAssignmentService.deleteAssignment(role, date);
    res.status(200).json({ message: "ลบบทบาทสำเร็จ" });
  } catch (err) {
    next(err);
  }
};
