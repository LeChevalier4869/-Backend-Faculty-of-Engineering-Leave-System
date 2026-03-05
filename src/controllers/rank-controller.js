const RankService = require("../services/rank-service");
const AuditLogService = require("../services/auditLog-service");
const createError = require("../utils/createError");

exports.getAllRanks = async (req, res, next) => {
  try {
    const ranks = await RankService.getAllRanks();
    res.status(200).json({ message: "ดึงข้อมูลเงื่อนไขวันลาทั้งหมดแล้ว", data: ranks });
  } catch (err) {
    next(err);
  }
};

exports.getRankById = async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) throw createError(400, "ID ไม่ถูกต้อง");

    const rank = await RankService.getRankById(id);
    if (!rank) throw createError(404, "ไม่พบเงื่อนไขวันลา");

    res.status(200).json({ message: "ดึงข้อมูลเงื่อนไขวันลาแล้ว", data: rank });
  } catch (err) {
    next(err);
  }
};

exports.createRank = async (req, res, next) => {
  try {
    const { rank, minHireMonths, maxHireMonths, receiveDays, maxDays, isBalance, personnelTypeId, leaveTypeId } = req.body;

    if (!rank || !personnelTypeId || !leaveTypeId) {
      throw createError(400, "กรุณาระบุข้อมูลให้ครบ (ชื่อ, ประเภทบุคลากร, ประเภทการลา)");
    }

    const created = await RankService.createRank({
      rank,
      minHireMonths: minHireMonths != null ? parseInt(minHireMonths) : null,
      maxHireMonths: maxHireMonths != null ? parseInt(maxHireMonths) : null,
      receiveDays: receiveDays != null ? parseInt(receiveDays) : null,
      maxDays: maxDays != null ? parseInt(maxDays) : null,
      isBalance: isBalance ?? null,
      personnelTypeId: parseInt(personnelTypeId),
      leaveTypeId: parseInt(leaveTypeId),
    });

    await AuditLogService.createLog(
      req.user.id,
      "CREATE",
      "Rank",
      created.id,
      `สร้างเงื่อนไขวันลา: ${rank} (PersonnelType: ${personnelTypeId}, LeaveType: ${leaveTypeId})`,
      req.ip,
      req.get("User-Agent")
    );

    res.status(201).json({ message: "สร้างเงื่อนไขวันลาเรียบร้อยแล้ว", data: created });
  } catch (err) {
    next(err);
  }
};

exports.updateRank = async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) throw createError(400, "ID ไม่ถูกต้อง");

    const oldRank = await RankService.getRankById(id);
    if (!oldRank) throw createError(404, "ไม่พบเงื่อนไขวันลาที่ต้องการอัปเดต");

    const { rank, minHireMonths, maxHireMonths, receiveDays, maxDays, isBalance, personnelTypeId, leaveTypeId } = req.body;

    const data = {};
    if (rank !== undefined) data.rank = rank;
    if (minHireMonths !== undefined) data.minHireMonths = minHireMonths != null ? parseInt(minHireMonths) : null;
    if (maxHireMonths !== undefined) data.maxHireMonths = maxHireMonths != null ? parseInt(maxHireMonths) : null;
    if (receiveDays !== undefined) data.receiveDays = receiveDays != null ? parseInt(receiveDays) : null;
    if (maxDays !== undefined) data.maxDays = maxDays != null ? parseInt(maxDays) : null;
    if (isBalance !== undefined) data.isBalance = isBalance;
    if (personnelTypeId !== undefined) data.personnelTypeId = parseInt(personnelTypeId);
    if (leaveTypeId !== undefined) data.leaveTypeId = parseInt(leaveTypeId);

    const updated = await RankService.updateRank(id, data);

    await AuditLogService.createUpdateLog(
      req.user.id,
      "Rank",
      id,
      oldRank,
      updated,
      req.ip,
      req.get("User-Agent")
    );

    res.status(200).json({ message: "อัปเดตเงื่อนไขวันลาเรียบร้อยแล้ว", data: updated });
  } catch (err) {
    next(err);
  }
};

exports.deleteRank = async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) throw createError(400, "ID ไม่ถูกต้อง");

    const existing = await RankService.getRankById(id);
    if (!existing) throw createError(404, "ไม่พบเงื่อนไขวันลาที่ต้องการลบ");

    await RankService.deleteRank(id);

    await AuditLogService.createLog(
      req.user.id,
      "DELETE",
      "Rank",
      id,
      `ลบเงื่อนไขวันลา: ${existing.rank} (ID: ${id})`,
      req.ip,
      req.get("User-Agent"),
      existing
    );

    res.status(200).json({ message: "ลบเงื่อนไขวันลาเรียบร้อยแล้ว" });
  } catch (err) {
    next(err);
  }
};
