const createError = require("../utils/createError");
const jwt = require("jsonwebtoken");
const prisma = require("../config/prisma");

const authorize = (requiredRoles) => (req, res, next) => {
  const r = req.user?.role || req.user?.roles || [];
  const userRoles = Array.isArray(r) ? r : [r];
  // SUPER_ADMIN สามารถเข้าถึงทุก route ที่ ADMIN เข้าได้
  const isSuperAdmin = userRoles.includes("SUPER_ADMIN");
  const ok = requiredRoles.some((role) => userRoles.includes(role))
    || (isSuperAdmin && requiredRoles.includes("ADMIN"));
  if (!ok) return next(createError(403, "Forbidden"));
  next();
};

const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res
        .status(401)
        .json({ message: "Missing or invalid Authorization header" });
    }

    const token = authHeader.split(" ")[1];

    // ตรวจสอบ JWT access token
    const payload = jwt.verify(token, process.env.JWT_ACCESS_SECRET);

    // โหลด user จาก DB
    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      include: {
        userRoles: { include: { role: true } },
        department: { include: { organization: true } },
        personnelType: { select: { name: true } },
        positionNumbers: {
          where: { isCurrent: true },
          select: {
            positionNumber: true,
            effectiveFrom: true,
          },
        },
        accounts: {
          select: {
            provider: true,
            profilePictureUrl: true,
          },
        },
      },
    });

    if (!user) return res.status(401).json({ message: "User not found" });

    // ดึง role names จาก userRoles
    const roleNames = (user.userRoles || [])
      .map((ur) => ur.role?.name)
      .filter(Boolean);

    // ฝัง role ลง req.user ให้ authorize ใช้ได้ทันที
    // เก็บทั้งรูปแบบ 'role' (array) และ 'roles' (เผื่อโค้ดส่วนอื่นอ้าง)
    const { userRoles, ...plainUser } = user; // ตัด relation ออกให้เบาขึ้น
    req.user = { ...plainUser, role: roleNames, roles: roleNames };

    //debug req.user
    // console.log("Authenticated User: ", req.user);
    // console.log("User Roles: ", roleNames);
    // console.log("req.user.role: ", req.user.role);

    next();
  } catch (err) {
    return res
      .status(401)
      .json({ message: "Unauthorized", error: err.message });
  }
};

// Optional middleware for testing (no authentication required)
const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (authHeader && authHeader.startsWith("Bearer ")) {
      const token = authHeader.split(" ")[1];
      const payload = jwt.verify(token, process.env.JWT_ACCESS_SECRET);

      // ถ้ามี token ให้ทำงานปกติ
      const user = await prisma.user.findUnique({
        where: { id: payload.userId },
        include: {
          userRoles: { include: { role: true } },
          department: { include: { organization: true } },
          personnelType: { select: { name: true } },
          positionNumbers: {
            where: { isCurrent: true },
            select: {
              positionNumber: true,
              effectiveFrom: true,
            },
          },
          accounts: {
            select: {
              provider: true,
              profilePictureUrl: true,
            },
          },
        },
      });

      if (user) {
        const roleNames = (user.userRoles || [])
          .map((ur) => ur.role?.name)
          .filter(Boolean);

        const { userRoles, ...plainUser } = user;
        req.user = { ...plainUser, role: roleNames, roles: roleNames };
      }
    }

    next();
  } catch (err) {
    // ถ้า token ไม่ถูกต้อง ให้ทำงานต่อไปได้ (optional auth)
    next();
  }
};

module.exports = { authenticate, authorize, optionalAuth };