const prisma = require("../config/prisma");
const createError = require("../utils/createError");
const LeaveBalanceService = require("../services/leaveBalance-service");

// บทบาทระดับ "คณะ" — เห็นผู้ใช้ได้ทั้งองค์กร (ผู้ตรวจสอบ/สารบรรณคณะ/รองคณบดี/คณบดี)
const FACULTY_ROLES = ["VERIFIER", "APPROVER_2", "APPROVER_3", "APPROVER_4"];

/**
 * ขอบเขตที่ผู้อนุมัติ "ดูแล" ได้ ขึ้นกับบทบาทที่ถือ (ยึดขอบเขตกว้างสุด)
 *  - ถือบทบาทระดับคณะ -> เห็นผู้ใช้ทั้งองค์กร (คณะ)
 *  - ถือแค่ APPROVER_1 (หัวหน้าสาขา) -> เห็นเฉพาะสาขาของตนเอง
 *  - ไม่ถือบทบาทผู้อนุมัติ -> null (เข้าไม่ได้)
 */
function resolveScope(reqUser) {
  const roles = Array.isArray(reqUser?.role)
    ? reqUser.role
    : Array.isArray(reqUser?.roles)
      ? reqUser.roles
      : [];
  const orgId =
    reqUser?.department?.organizationId ??
    reqUser?.department?.organization?.id ??
    null;
  const deptId = reqUser?.departmentId ?? null;

  if (roles.some((r) => FACULTY_ROLES.includes(r))) {
    return {
      level: "faculty",
      organizationId: orgId,
      departmentId: deptId,
      where: orgId ? { department: { organizationId: orgId } } : { id: -1 },
    };
  }
  if (roles.includes("APPROVER_1")) {
    return {
      level: "department",
      organizationId: orgId,
      departmentId: deptId,
      where: deptId ? { departmentId: deptId } : { id: -1 },
    };
  }
  return null;
}

const USER_SELECT = {
  id: true,
  prefixName: true,
  firstName: true,
  lastName: true,
  email: true,
  position: true,
  profilePicturePath: true,
  department: {
    select: {
      id: true,
      name: true,
      organization: { select: { id: true, name: true } },
    },
  },
};

function fullName(u) {
  return `${u.prefixName || ""}${u.prefixName ? " " : ""}${u.firstName || ""} ${u.lastName || ""}`.trim();
}

// GET /approver/oversight/scope — บอก UI ว่าขอบเขตเป็นระดับคณะหรือสาขา
exports.getScope = async (req, res, next) => {
  try {
    const scope = resolveScope(req.user);
    if (!scope) throw createError(403, "เฉพาะผู้อนุมัติเท่านั้นที่เข้าถึงได้");
    res.json({
      data: {
        level: scope.level,
        organization: req.user?.department?.organization?.name ?? null,
        department: req.user?.department?.name ?? null,
      },
    });
  } catch (err) {
    next(err);
  }
};

// GET /approver/oversight/users?search= — รายชื่อผู้ใช้ในขอบเขตที่ดูแล
exports.listUsers = async (req, res, next) => {
  try {
    const scope = resolveScope(req.user);
    if (!scope) throw createError(403, "เฉพาะผู้อนุมัติเท่านั้นที่เข้าถึงได้");

    const { search } = req.query;
    const where = { ...scope.where };
    if (search) {
      where.OR = [
        { firstName: { contains: search } },
        { lastName: { contains: search } },
        { email: { contains: search } },
        { prefixName: { contains: search } },
      ];
    }

    const users = await prisma.user.findMany({
      where,
      select: USER_SELECT,
      orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
    });

    res.json({
      data: users.map((u) => ({ ...u, fullName: fullName(u) })),
      scope: { level: scope.level },
    });
  } catch (err) {
    next(err);
  }
};

// GET /approver/oversight/users/:userId — โปรไฟล์ + ยอดวันลา + ประวัติการลา (ตรวจขอบเขต)
exports.getUserDetail = async (req, res, next) => {
  try {
    const scope = resolveScope(req.user);
    if (!scope) throw createError(403, "เฉพาะผู้อนุมัติเท่านั้นที่เข้าถึงได้");

    const userId = Number(req.params.userId);
    if (!userId || Number.isNaN(userId)) throw createError(400, "Invalid user id");

    const profile = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        ...USER_SELECT,
        phone: true,
        personnelType: { select: { name: true } },
        positionNumbers: {
          where: { isCurrent: true },
          take: 1,
          select: { positionNumber: true },
        },
      },
    });
    if (!profile) throw createError(404, "ไม่พบผู้ใช้งาน");

    // ตรวจว่าผู้ใช้เป้าหมายอยู่ในขอบเขตที่ดูแลจริง
    const inScope =
      scope.level === "faculty"
        ? profile.department?.organization?.id === scope.organizationId
        : profile.department?.id === scope.departmentId;
    if (!inScope) throw createError(403, "ผู้ใช้นี้อยู่นอกขอบเขตที่คุณดูแล");

    const [balances, history] = await Promise.all([
      LeaveBalanceService.getAllBalancesForUser(userId),
      prisma.leaveRequest.findMany({
        where: { userId },
        select: {
          id: true,
          leaveTypeId: true,
          startDate: true,
          endDate: true,
          thisTimeDays: true,
          totalDays: true,
          status: true,
          createdAt: true,
          documentNumber: true,
          leaveType: { select: { name: true } },
        },
        orderBy: { createdAt: "desc" },
      }),
    ]);

    res.json({
      data: {
        profile: { ...profile, fullName: fullName(profile) },
        balances,
        history,
      },
    });
  } catch (err) {
    next(err);
  }
};
