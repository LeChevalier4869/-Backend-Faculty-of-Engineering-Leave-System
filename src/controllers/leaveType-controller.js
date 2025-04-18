const LeaveTypeService = require("../services/leaveType-service");
const createError = require("../utils/createError");

exports.createLeaveType = async (req, res, next) => {
  try {
    const { name, conditions } = req.body;
    if (!name) throw createError(400, "กรุณาระบุชื่อประเภทการลา");

    const leaveType = await LeaveTypeService.createLeaveType(
      name,
      conditions
    );
    res.status(201).json({ message: "สร้างประเภทการลาเรียบร้อยแล้ว", data: leaveType });
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
      throw createError(400, "รหัสประเภทการลาไม่ถูกต้อง");
    }

    const leaveType = await LeaveTypeService.updateLeaveType(numID, updates);
    res.status(200).json({ message: "อัปเดตประเภทการลาแล้ว", data: leaveType });
  } catch (err) {
    next(err);
  }
};

exports.deleteLeaveType = async (req, res, next) => {
  try {
    const { id } = req.params;
    const numID = Number(id);

    if (!numID || isNaN(id)) {
      throw createError(400, "รหัสประเภทการลาไม่ถูกต้อง");
    }

    const deleted = await LeaveTypeService.deleteLeaveType(numID);
    if (!deleted) throw createError(404, "ไม่พบประเภทการลาที่ต้องการลบ"); 

    res.status(200).json({ message: "ลบประเภทการลาเรียบร้อยแล้ว" });
  } catch (err) {
    next(err);
  }
};

exports.getAllLeaveType = async (req, res, next) => {
  try {
    const leaveType = await LeaveTypeService.getAllLeaveTypes();
    res.status(200).json({ message: "ดึงข้อมูลประเภทการลาทั้งหมดแล้ว", data: leaveType });
  } catch (err) {
    next(err);
  }
};

exports.getLeaveTypeById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const numID = Number(id);

    if (!numID || isNaN(id)) {
      throw createError(400, "รหัสประเภทการลาไม่ถูกต้อง");
    }

    const leaveType = await LeaveTypeService.getLeaveTypeById(numID);

    if (!leaveType) {
      throw createError(404, "ไม่พบประเภทการลาที่ต้องการ");
    }

    res.status(200).json({ message: "ดึงข้อมูลประเภทการลาเรียบร้อยแล้ว", data: leaveType });
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
