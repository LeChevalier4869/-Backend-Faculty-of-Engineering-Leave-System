const LeaveBalanceService = require("../services/leaveBalance-service");
const createError = require("../utils/createError");

exports.getLeaveBalanceByUserId = async (req, res, next) => {
  const userId = req.user.id;
  try {
    if (!userId || isNaN(userId)) {
      throw createError(400, "รหัสผู้ใช้งานไม่ถูกต้อง");
    }

    const leaveBalance = await LeaveBalanceService.getBalanceById(userId);

    if (!leaveBalance) {
      throw createError(404, "ไม่พบข้อมูล Leave Balance");
    }

    res
      .status(200)
      .json({ message: "ดึงข้อมูล Leave Balance สำเร็จ", data: leaveBalance });
  } catch (err) {
    next(err);
  }
};

exports.getLeaveBalanceMe = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const balances = await LeaveBalanceService.getAllBalancesForUser(userId);
    res
      .status(200)
      .json({ message: "ดึงข้อมูล Leave Balance ของคุณสำเร็จ", data: balances });
  } catch (err) {
    next(err);
  }
};

exports.getAllLeaveBalances = async (req, res, next) => {
  try {
    const balances = await LeaveBalanceService.getAllLeaveBalances();
    res
      .status(200)
      .json({ message: "ดึงข้อมูล Leave Balance ทั้งหมดสำเร็จ", data: balances });
  } catch (err) {
    next(err);
  }
};

exports.updateLeaveBalance = async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!id || isNaN(id)) throw createError(400, "รหัส Leave Balance ไม่ถูกต้อง");

    const updateData = req.body;
    const updated = await LeaveBalanceService.updateLeaveBalance(id, updateData);
    res
      .status(200)
      .json({ message: "อัปเดต Leave Balance สำเร็จ", data: updated });
  } catch (err) {
    next(err);
  }
};
