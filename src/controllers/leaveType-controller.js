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

// not avaliable when use id 
exports.updateLeaveType = async (req, res, next) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    if (!id || isNaN(Number(id))) {
        throw createError(400, 'Invalid ID provided');
    }

    const leaveType = await LeaveTypeService.updateLeaveType(Number(id), updates);
    res.status(200).json({ message: "Leave type updated", leaveType });
  } catch (err) {
    next(err);
  }
};

exports.deleteLeaveType = async (req, res, next) => {
  try {
    const { id } = req.params;
    await LeaveTypeService.deleteLeaveType(id);
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
    const leaveType = await LeaveTypeService.getLeaveTypeByID(id);
    res.status(200).json({ leaveType });
  } catch (err) {
    next(err);
  }
};
