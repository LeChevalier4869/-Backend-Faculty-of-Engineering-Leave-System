const AuditLogService = require("../services/auditLog-service");
const createError = require("../utils/createError");

// ดึงข้อมูล Audit Log ทั้งหมด (สำหรับ Admin)
exports.getAllAuditLogs = async (req, res, next) => {
  try {
    const {
      page = 1,
      limit = 50,
      userId,
      action,
      startDate,
      endDate
    } = req.query;

    const options = {
      page: parseInt(page),
      limit: parseInt(limit),
      userId,
      action,
      startDate,
      endDate,
    };

    const result = await AuditLogService.getAllLogs(options);

    res.status(200).json({
      message: "ดึงข้อมูล Audit Log สำเร็จ",
      data: result.logs,
      pagination: result.pagination,
    });
  } catch (err) {
    next(err);
  }
};

// ดึงข้อมูล Audit Log ตาม userId
exports.getAuditLogsByUserId = async (req, res, next) => {
  try {
    const { userId } = req.params;
    const {
      page = 1,
      limit = 50,
      action,
      startDate,
      endDate
    } = req.query;

    if (!userId || isNaN(userId)) {
      throw createError(400, "Invalid user id");
    }

    const options = {
      page: parseInt(page),
      limit: parseInt(limit),
      action,
      startDate,
      endDate,
    };

    const result = await AuditLogService.getLogsByUserId(userId, options);

    res.status(200).json({
      message: "ดึงข้อมูล Audit Log ตาม userId สำเร็จ",
      data: result.logs,
      pagination: result.pagination,
    });
  } catch (err) {
    next(err);
  }
};

// ดึงข้อมูล Audit Log ตาม leaveRequestId
exports.getAuditLogsByLeaveRequestId = async (req, res, next) => {
  try {
    const { leaveRequestId } = req.params;

    if (!leaveRequestId || isNaN(leaveRequestId)) {
      throw createError(400, "Invalid leave request id");
    }

    const logs = await AuditLogService.getLogsByLeaveRequestId(leaveRequestId);

    res.status(200).json({
      message: "ดึงข้อมูล Audit Log ตามคำขอลาสำเร็จ",
      data: logs,
    });
  } catch (err) {
    next(err);
  }
};

// ดึงข้อมูลสถิติการกระทำ (สำหรับ Dashboard)
exports.getActionStats = async (req, res, next) => {
  try {
    const { startDate, endDate } = req.query;

    const stats = await AuditLogService.getActionStats(startDate, endDate);

    res.status(200).json({
      message: "ดึงข้อมูลสถิติการกระทำสำเร็จ",
      data: stats,
    });
  } catch (err) {
    next(err);
  }
};

// สร้าง Audit Log ใหม่ (สำหรับการทดสอบหรือการใช้งานพิเศษ)
exports.createAuditLog = async (req, res, next) => {
  try {
    const { userId, action, leaveRequestId, details } = req.body;

    if (!userId || !action) {
      throw createError(400, "ต้องระบุ userId และ action");
    }

    const log = await AuditLogService.createLog(userId, action, leaveRequestId, details);

    res.status(201).json({
      message: "สร้าง Audit Log สำเร็จ",
      data: log,
    });
  } catch (err) {
    next(err);
  }
};

// ดึงข้อมูล entity จาก Audit Log (สำหรับ entity ที่ถูกลบไปแล้ว)
exports.getEntityData = async (req, res, next) => {
  try {
    const { entityType, entityId } = req.params;

    if (!entityType || !entityId) {
      throw createError(400, "ต้องระบุ entityType และ entityId");
    }

    const entityData = await AuditLogService.getEntityData(entityType, entityId);

    if (!entityData) {
      throw createError(404, "ไม่พบข้อมูล entity");
    }

    res.status(200).json({
      message: "ดึงข้อมูล entity สำเร็จ",
      data: entityData,
      isDeleted: !await AuditLogService.getEntitySnapshot(entityType, entityId)
    });
  } catch (err) {
    next(err);
  }
};
exports.logUserAction = async (req, res, next) => {
  try {
    const { userId, action, details } = req.body;

    if (!userId || !action) {
      throw createError(400, "ต้องระบุ userId และ action");
    }

    const log = await AuditLogService.logUserAction(userId, action, details);

    res.status(201).json({
      message: "บันทึกการกระทำของผู้ใช้สำเร็จ",
      data: log,
    });
  } catch (err) {
    next(err);
  }
};
