const LeaveTypeService = require("../services/leaveType-service");
const createError = require("../utils/createError");

exports.createLeaveType = async (req, res, next) => {
  try {
    const { name, conditions } = req.body;
    const leaveType = await LeaveTypeService.createLeaveType(
      name,
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


//ใหม่ยังไม่เสร็จ----------------------------------------------------------------------------------------------------------------------------------
// const leaveTypeService = require("../services/leaveType-service");

// const getAll = async (req, res) => {
//   const types = await leaveTypeService.getAllLeaveTypes();
//   res.json(types);
// };

// const getById = async (req, res) => {
//   const id = parseInt(req.params.id);
//   const type = await leaveTypeService.getLeaveTypeById(id);
//   if (!type) return res.status(404).json({ message: "Not found" });
//   res.json(type);
// };

// const create = async (req, res) => {
//   const { name, is_available } = req.body;
//   const newType = await leaveTypeService.createLeaveType({ name, is_available });
//   res.status(201).json(newType);
// };

// const update = async (req, res) => {
//   const id = parseInt(req.params.id);
//   const { name, is_available } = req.body;
//   const updated = await leaveTypeService.updateLeaveType(id, { name, is_available });
//   res.json(updated);
// };

// const remove = async (req, res) => {
//   const id = parseInt(req.params.id);
//   await leaveTypeService.deleteLeaveType(id);
//   res.json({ message: "Deleted" });
// };

// module.exports = {
//   getAll,
//   getById,
//   create,
//   update,
//   remove,
// };
