const ProxyApprovalService = require("../services/proxyApproval-service");
const AuditLogService = require("../services/auditLog-service");
const createError = require("../utils/createError");

// ────────────────────────────────
// 🟢 CREATE
// ────────────────────────────────

// สร้างการมอบอำนาจให้ผู้อนุมัติแทน
exports.createProxyApproval = async (req, res, next) => {
  try {
    const {
      originalApproverId,
      proxyApproverId,
      approverLevel,
      startDate,
      endDate,
      reason,
      isDaily = false,
      dailyDate = null,
    } = req.body;

    const proxyApproval = await ProxyApprovalService.createProxyApproval({
      originalApproverId,
      proxyApproverId,
      approverLevel,
      startDate,
      endDate,
      reason,
      isDaily,
      dailyDate,
    });

    // บันทึก log การทำงาน
    await AuditLogService.createLog(
      req.user.id,
      "Create Proxy Approval",
      "ProxyApproval",
      proxyApproval.id,
      `Created proxy approval: ${proxyApproval.id}`,
      req.ip,
      req.get("User-Agent")
    );

    res.status(201).json({
      message: isDaily 
        ? "สร้างการมอบอำนาจรายวันสำเร็จ"
        : "สร้างการมอบอำนาจสำเร็จ",
      data: proxyApproval,
    });
  } catch (err) {
    next(err);
  }
};

// สร้างการมอบอำนาจรายวัน (สำหรับ admin)
exports.createDailyProxyApproval = async (req, res, next) => {
  try {
    const {
      originalApproverId,
      proxyApproverId,
      approverLevel,
      dailyDate,
      reason,
    } = req.body;

    const proxyApproval = await ProxyApprovalService.createDailyProxyApproval({
      originalApproverId,
      proxyApproverId,
      approverLevel,
      dailyDate,
      reason,
    });

    // บันทึก log การทำงาน
    await AuditLogService.createLog(
      req.user.id,
      "Create Daily Proxy Approval",
      "ProxyApproval",
      proxyApproval.id,
      `Created daily proxy approval: ${proxyApproval.id}`,
      req.ip,
      req.get("User-Agent")
    );

    res.status(201).json({
      message: "สร้างการมอบอำนาจรายวันสำเร็จ",
      data: proxyApproval,
    });
  } catch (err) {
    next(err);
  }
};

// ────────────────────────────────
// 🔎 READ
// ────────────────────────────────

// ดึงข้อมูลการมอบอำนาจทั้งหมด
exports.getAllProxyApprovals = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const sort = req.query.sort || 'createdAt';
    const order = req.query.order || 'desc';
    
    const proxyApprovals = await ProxyApprovalService.getAllProxyApprovals(page, limit, sort, order);
    
    res.status(200).json({
      message: "ดึงข้อมูลการมอบอำนาจทั้งหมดสำเร็จ",
      data: proxyApprovals.data,
      pagination: {
        currentPage: proxyApprovals.currentPage,
        totalPages: proxyApprovals.totalPages,
        totalCount: proxyApprovals.totalCount,
        limit: proxyApprovals.limit
      }
    });
  } catch (err) {
    next(err);
  }
};

// ดึงข้อมูลการมอบอำนาจสำหรับวันนี้ (ปัจจุบัน)
exports.getTodayProxyApprovals = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const sort = req.query.sort || 'createdAt';
    const order = req.query.order || 'desc';
    
    const proxyApprovals = await ProxyApprovalService.getTodayProxyApprovals(page, limit, sort, order);
    
    res.status(200).json({
      message: "ดึงข้อมูลการมอบอำนาจสำหรับวันนี้สำเร็จ",
      data: proxyApprovals.data,
      pagination: {
        currentPage: proxyApprovals.currentPage,
        totalPages: proxyApprovals.totalPages,
        totalCount: proxyApprovals.totalCount,
        limit: proxyApprovals.limit
      },
      meta: {
        isToday: proxyApprovals.isToday,
        date: proxyApprovals.date
      }
    });
  } catch (err) {
    next(err);
  }
};

// ดึงประวัติการมอบอำนาจทั้งหมด (ยกเว้นวันนี้)
exports.getHistoryProxyApprovals = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const sort = req.query.sort || 'createdAt';
    const order = req.query.order || 'desc';
    
    const proxyApprovals = await ProxyApprovalService.getHistoryProxyApprovals(page, limit, sort, order);
    
    res.status(200).json({
      message: "ดึงประวัติการมอบอำนาจสำเร็จ",
      data: proxyApprovals.data,
      pagination: {
        currentPage: proxyApprovals.currentPage,
        totalPages: proxyApprovals.totalPages,
        totalCount: proxyApprovals.totalCount,
        limit: proxyApprovals.limit
      },
      meta: {
        isHistory: proxyApprovals.isHistory
      }
    });
  } catch (err) {
    next(err);
  }
};

// ดึงข้อมูลการมอบอำนาจตาม ID
exports.getProxyApprovalById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const proxyApproval = await ProxyApprovalService.getProxyApprovalById(id);
    
    res.status(200).json({
      message: "ดึงข้อมูลการมอบอำนาจสำเร็จ",
      data: proxyApproval,
    });
  } catch (err) {
    next(err);
  }
};

// ดึงข้อมูลการมอบอำนาจที่ผู้ใช้เป็นผู้อนุมัติต้นฉบับ
exports.getProxyApprovalsByOriginalApprover = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const proxyApprovals = await ProxyApprovalService.getProxyApprovalsByOriginalApprover(userId);
    
    res.status(200).json({
      message: "ดึงข้อมูลการมอบอำนาจที่คุณเป็นผู้อนุมัติต้นฉบับสำเร็จ",
      data: proxyApprovals,
    });
  } catch (err) {
    next(err);
  }
};

// ดึงข้อมูลการมอบอำนาจที่ผู้ใช้เป็นผู้อนุมัติแทน
exports.getProxyApprovalsByProxyApprover = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const proxyApprovals = await ProxyApprovalService.getProxyApprovalsByProxyApprover(userId);
    
    res.status(200).json({
      message: "ดึงข้อมูลการมอบอำนาจที่คุณเป็นผู้อนุมัติแทนสำเร็จ",
      data: proxyApprovals,
    });
  } catch (err) {
    next(err);
  }
};

// ดึงข้อมูลการมอบอำนาจรายวันสำหรับวันที่กำหนด
exports.getDailyProxyApprovalsByDate = async (req, res, next) => {
  try {
    const { date } = req.query;
    
    if (!date) {
      throw createError(400, "ต้องระบุวันที่");
    }

    const proxyApprovals = await ProxyApprovalService.getDailyProxyApprovalsByDate(date);
    
    res.status(200).json({
      message: "ดึงข้อมูลการมอบอำนาจรายวันสำเร็จ",
      data: proxyApprovals,
    });
  } catch (err) {
    next(err);
  }
};

// ดึงข้อมูลการมอบอำนาจรายวันทั้งหมดของผู้ใช้
exports.getMyDailyProxyApprovals = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const proxyApprovals = await ProxyApprovalService.getMyDailyProxyApprovals(userId);
    
    res.status(200).json({
      message: "ดึงข้อมูลการมอบอำนาจรายวันของคุณสำเร็จ",
      data: proxyApprovals,
    });
  } catch (err) {
    next(err);
  }
};

// ตรวจสอบการมอบอำนาจที่ใช้ได้ในปัจจุบัน
exports.getActiveProxyApproval = async (req, res, next) => {
  try {
    const { originalApproverId, approverLevel } = req.query;
    
    if (!originalApproverId || !approverLevel) {
      throw createError(400, "ต้องระบุ originalApproverId และ approverLevel");
    }

    const proxyApproval = await ProxyApprovalService.getActiveProxyApproval(
      originalApproverId,
      approverLevel
    );
    
    res.status(200).json({
      message: "ตรวจสอบการมอบอำนาจสำเร็จ",
      data: proxyApproval,
    });
  } catch (err) {
    next(err);
  }
};

// ตรวจสอบสิทธิ์การอนุมัติของผู้ใช้
exports.checkApprovalPermission = async (req, res, next) => {
  try {
    const { approverLevel } = req.query;
    const userId = req.user.id;
    
    if (!approverLevel) {
      throw createError(400, "ต้องระบุ approverLevel");
    }

    const permission = await ProxyApprovalService.canUserApprove(userId, approverLevel);
    
    res.status(200).json({
      message: "ตรวจสอบสิทธิ์การอนุมัติสำเร็จ",
      data: permission,
    });
  } catch (err) {
    next(err);
  }
};

// ดึงข้อมูลผู้อนุมัติที่เป็นไปได้
exports.getPotentialApprovers = async (req, res, next) => {
  try {
    const { approverLevel } = req.query;
    
    if (!approverLevel) {
      throw createError(400, "ต้องระบุ approverLevel");
    }

    const potentialApprovers = await ProxyApprovalService.getPotentialApprovers(
      parseInt(approverLevel),
      req.user.id // ส่ง currentUserId ไปด้วย
    );
    
    res.status(200).json({
      message: "ดึงข้อมูลผู้อนุมัติที่เป็นไปได้สำเร็จ",
      data: potentialApprovers,
    });
  } catch (err) {
    next(err);
  }
};

// ────────────────────────────────
// 🔁 UPDATE
// ────────────────────────────────

// อัปเดตข้อมูลการมอบอำนาจ
exports.updateProxyApproval = async (req, res, next) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    console.log('🔍 Debug - Update Proxy Approval:');
    console.log('ID:', id);
    console.log('UpdateData:', updateData);
    console.log('User:', req.user);

    const updatedProxy = await ProxyApprovalService.updateProxyApproval(id, updateData);

    // บันทึก log การทำงาน
    await AuditLogService.createLog(
      req.user.id,
      "Update Proxy Approval",
      "ProxyApproval",
      parseInt(id),
      `Updated proxy approval: ${id}`,
      req.ip,
      req.get("User-Agent")
    );

    res.status(200).json({
      message: "อัปเดตการมอบอำนาจสำเร็จ",
      data: updatedProxy,
    });
  } catch (err) {
    console.log('❌ Error in updateProxyApproval:', err.message);
    next(err);
  }
};

// ยกเลิกการมอบอำนาจ
exports.cancelProxyApproval = async (req, res, next) => {
  try {
    const { id } = req.params;
    const cancelledBy = req.user.id;

    const cancelledProxy = await ProxyApprovalService.cancelProxyApproval(id, cancelledBy);

    res.status(200).json({
      message: "ยกเลิกการมอบอำนาจสำเร็จ",
      data: cancelledProxy,
    });
  } catch (err) {
    next(err);
  }
};

// อัปเดตสถานะการมอบอำนาจที่หมดอายุ (สำหรับ cron job)
exports.expireProxyApprovals = async (req, res, next) => {
  try {
    const result = await ProxyApprovalService.expireProxyApprovals();

    res.status(200).json({
      message: "อัปเดตสถานะการมอบอำนาจที่หมดอายุสำเร็จ",
      data: {
        periodProxies: result.periodProxies.count,
        dailyProxies: result.dailyProxies.count,
        totalExpired: result.totalExpired,
      },
    });
  } catch (err) {
    next(err);
  }
};

// ลบข้อมูลการมอบอำนาจรายวันที่หมดอายุ (cleanup)
exports.cleanupExpiredDailyProxies = async (req, res, next) => {
  try {
    const { daysToKeep = 7 } = req.query;
    
    const result = await ProxyApprovalService.cleanupExpiredDailyProxies(
      parseInt(daysToKeep)
    );

    res.status(200).json({
      message: "ลบข้อมูลการมอบอำนาจรายวันที่หมดอายุสำเร็จ",
      data: {
        deletedCount: result.count,
        daysToKeep: parseInt(daysToKeep),
      },
    });
  } catch (err) {
    next(err);
  }
};

// ────────────────────────────────
// 🔧 UTIL
// ────────────────────────────────

// ดึงข้อมูลสถิติการมอบอำนาจ
exports.getProxyApprovalStats = async (req, res, next) => {
  try {
    const ProxyApprovalService = require("../services/proxyApproval-service");
    const prisma = require("../config/prisma");

    const stats = await prisma.proxyApproval.groupBy({
      by: ["status"],
      _count: {
        id: true,
      },
    });

    const totalApprovals = await prisma.proxyApproval.count();

    const formattedStats = {
      total: totalApprovals,
      active: stats.find(s => s.status === "ACTIVE")?._count.id || 0,
      expired: stats.find(s => s.status === "EXPIRED")?._count.id || 0,
      cancelled: stats.find(s => s.status === "CANCELLED")?._count.id || 0,
    };

    res.status(200).json({
      message: "ดึงข้อมูลสถิติการมอบอำนาจสำเร็จ",
      data: formattedStats,
    });
  } catch (err) {
    next(err);
  }
};
