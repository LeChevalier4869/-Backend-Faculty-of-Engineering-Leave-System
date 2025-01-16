const LeaveTypeService = require("../services/leaveType-service");
const createError = require("../utils/createError");

exports.createLeaveType = async (req, res, next) => {
  try {
    const { name, maxDays, conditions } = req.body;
    const leaveType = await LeaveTypeService.createLeaveType(
      name,
      maxDays,
      conditions
    );
    res.status(201).json({ message: "Leave type created", leaveType });
  } catch (err) {
    next(err);
  }
};

exports.updateLeaveType = async (req, res, next) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    const numID = Number(id);

    if (!numID || isNaN(id)) {
      throw createError(400, "Invalid ID provided");
    }

    const leaveType = await LeaveTypeService.updateLeaveType(numID, updates);
    res.status(200).json({ message: "Leave type updated", leaveType });
  } catch (err) {
    next(err);
  }
};

exports.deleteLeaveType = async (req, res, next) => {
  try {
    const { id } = req.params;
    const numID = Number(id);

    if (!numID || isNaN(id)) {
      throw createError(400, "Invalid ID provided");
    }

    await LeaveTypeService.deleteLeaveType(numID);
    res.status(200).json({ message: "Leave type deleted" });
  } catch (err) {
    next(err);
  }
};

exports.getAllLeaveType = async (req, res, next) => {
  try {
    const leaveType = await LeaveTypeService.getAllLeaveTypes();
    res.status(200).json({ leaveType });
  } catch (err) {
    next(err);
  }
};

exports.getLeaveTypeById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const numID = Number(id);

    if (!numID || isNaN(id)) {
      throw createError(400, "Invalid ID provided");
    }

    const leaveType = await LeaveTypeService.getLeaveTypeByID(numID);

    if (!leaveType) {
      throw createError(404, `Leave type with ID ${id} not found`);
    }

    res.status(200).json({ leaveType });
  } catch (err) {
    next(err);
  }
};
