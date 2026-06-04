const RankService = require("../services/rank-service");
const AuditLogService = require("../services/auditLog-service");
const createError = require("../utils/createError");

// แปลงค่าเป็น Int โดยถือว่า null/undefined/ค่าว่าง = null (กัน parseInt("") = NaN)
const toIntOrNull = (v) => {
  if (v === null || v === undefined || String(v).trim() === "") return null;
  const n = parseInt(v, 10);
  return Number.isNaN(n) ? null : n;
};

// ตรวจช่วงอายุงานและจำนวนวันให้สมเหตุสมผล
const validateRankNumbers = ({ minHireMonths, maxHireMonths, receiveDays, maxDays }) => {
  if (
    minHireMonths != null &&
    maxHireMonths != null &&
    minHireMonths > maxHireMonths
  ) {
    throw createError(400, "อายุงานขั้นต่ำต้องไม่มากกว่าขั้นสูง");
  }
  if (receiveDays != null && receiveDays < 0)
    throw createError(400, "วันที่ได้รับต่อปีต้องไม่ติดลบ");
  if (maxDays != null && maxDays < 0)
    throw createError(400, "วันสะสมสูงสุดต้องไม่ติดลบ");
  if (receiveDays != null && maxDays != null && receiveDays > maxDays)
    throw createError(400, "วันที่ได้รับต่อปีต้องไม่มากกว่าวันสะสมสูงสุด");
};

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

    const payload = {
      rank: String(rank).trim(),
      minHireMonths: toIntOrNull(minHireMonths),
      maxHireMonths: toIntOrNull(maxHireMonths),
      receiveDays: toIntOrNull(receiveDays),
      maxDays: toIntOrNull(maxDays),
      isBalance: isBalance ?? null,
      personnelTypeId: parseInt(personnelTypeId),
      leaveTypeId: parseInt(leaveTypeId),
    };
    validateRankNumbers(payload);

    const overlap = await RankService.findOverlappingRank({
      personnelTypeId: payload.personnelTypeId,
      leaveTypeId: payload.leaveTypeId,
      minHireMonths: payload.minHireMonths,
      maxHireMonths: payload.maxHireMonths,
    });
    if (overlap) {
      throw createError(
        400,
        `ช่วงอายุงานทับซ้อนกับเงื่อนไขที่มีอยู่แล้ว (${overlap.rank})`
      );
    }

    const created = await RankService.createRank(payload);

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
    if (rank !== undefined) data.rank = String(rank).trim();
    if (minHireMonths !== undefined) data.minHireMonths = toIntOrNull(minHireMonths);
    if (maxHireMonths !== undefined) data.maxHireMonths = toIntOrNull(maxHireMonths);
    if (receiveDays !== undefined) data.receiveDays = toIntOrNull(receiveDays);
    if (maxDays !== undefined) data.maxDays = toIntOrNull(maxDays);
    if (isBalance !== undefined) data.isBalance = isBalance;
    if (personnelTypeId !== undefined) data.personnelTypeId = parseInt(personnelTypeId);
    if (leaveTypeId !== undefined) data.leaveTypeId = parseInt(leaveTypeId);

    // ตรวจความสมเหตุสมผล โดยรวมค่าที่อัปเดตกับค่าเดิม
    const effective = {
      personnelTypeId: data.personnelTypeId ?? oldRank.personnelTypeId,
      leaveTypeId: data.leaveTypeId ?? oldRank.leaveTypeId,
      minHireMonths: data.minHireMonths ?? oldRank.minHireMonths,
      maxHireMonths: data.maxHireMonths ?? oldRank.maxHireMonths,
      receiveDays: data.receiveDays ?? oldRank.receiveDays,
      maxDays: data.maxDays ?? oldRank.maxDays,
    };
    validateRankNumbers(effective);

    const overlap = await RankService.findOverlappingRank({
      personnelTypeId: effective.personnelTypeId,
      leaveTypeId: effective.leaveTypeId,
      minHireMonths: effective.minHireMonths,
      maxHireMonths: effective.maxHireMonths,
      excludeId: id,
    });
    if (overlap) {
      throw createError(
        400,
        `ช่วงอายุงานทับซ้อนกับเงื่อนไขที่มีอยู่แล้ว (${overlap.rank})`
      );
    }

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
