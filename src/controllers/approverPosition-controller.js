const createError = require("../utils/createError");
const ApproverPositionService = require("../services/approverPosition-service");

/** GET /admin/approver-positions — ผู้ดำรงตำแหน่งปัจจุบันของทุกระดับคณะ */
exports.listCurrent = async (req, res, next) => {
  try {
    const data = await ApproverPositionService.listCurrent();
    res.status(200).json({ message: "respones ok", data });
  } catch (err) {
    next(err);
  }
};

/** GET /admin/approver-positions/:level/history — ประวัติการดำรงตำแหน่ง */
exports.history = async (req, res, next) => {
  try {
    const level = parseInt(req.params.level, 10);
    if (!Number.isInteger(level)) {
      throw createError(400, "level ต้องเป็นตัวเลข");
    }
    const data = await ApproverPositionService.history(level);
    res.status(200).json({ message: "respones ok", data });
  } catch (err) {
    next(err);
  }
};

/** POST /admin/approver-positions — แต่งตั้งผู้ดำรงตำแหน่ง (แทนคนเดิม) */
exports.assign = async (req, res, next) => {
  try {
    const level = parseInt(req.body.level, 10);
    const userId = parseInt(req.body.userId, 10);

    if (!Number.isInteger(level) || !Number.isInteger(userId)) {
      throw createError(400, "level และ userId ต้องเป็นตัวเลข");
    }

    const result = await ApproverPositionService.assign(level, userId);

    res.status(200).json({
      message: `แต่งตั้ง${result.label}เรียบร้อยแล้ว`,
      data: result.position,
    });
  } catch (err) {
    next(err);
  }
};

/** DELETE /admin/approver-positions/:level — ปลดผู้ดำรงตำแหน่ง */
exports.vacate = async (req, res, next) => {
  try {
    const level = parseInt(req.params.level, 10);
    if (!Number.isInteger(level)) {
      throw createError(400, "level ต้องเป็นตัวเลข");
    }

    const result = await ApproverPositionService.vacate(level);

    res.status(200).json({ message: "ปลดผู้ดำรงตำแหน่งเรียบร้อยแล้ว", data: result });
  } catch (err) {
    next(err);
  }
};
