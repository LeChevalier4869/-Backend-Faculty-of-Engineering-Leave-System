const createError = require("../utils/createError");
const jwt = require("jsonwebtoken");
const prisma = require("../config/prisma");

// const authenticate = (req, res, next) => {
//     const token = req.headers.authorization?.split(' ')[1];
//     console.log(req.headers);
//     console.log(req.headers.authorization);
//     console.log("Token: ", token);
//     if (!token) {
//         return next(createError(401, 'Unauthorized'));
//     }
//     try {
//         const decoded = jwt.verify(token, process.env.JWT_SECRET);
//         console.log("Decoded User: ", decoded);

//         // check token expiration

//         const now = Math.floor(Date.now() / 1000); // หน่วยเป็นวินาที
//         if (decoded.exp && decoded.exp < now) {
//             return next(createError(401, 'Token expired'));
//         }

//         req.user = decoded;
//         next();
//     } catch (err) {
//         console.error("JWT decode error:", err.message); // เพิ่ม log
//         next(createError(401, 'Unauthorized'));
//     }

// };

const authorize = (requiredRoles) => (req, res, next) => {
  // if (!req.user || !req.user.role) {
  //   return next(createError(403, "Forbidden: no role assigned."));
  // }
  // // console.log("Debug User Role: ", req.user.role);

  // const userRoles = Array.isArray(req.user.role)
  //   ? req.user.role
  //   : [req.user.role];
  // //const roleNames = Array.isArray(userRoles) ? userRoles.map(role => role.name) : [];
  // const hasRequiredRole = requiredRoles.some((role) =>
  //   userRoles.includes(role)
  // );
  // // console.log("Decoded userRole: ", userRoles);
  // //console.log("Decoded roleNames: ", roleNames);
  // // console.log("Decoded hasRequire Role: ", hasRequiredRole);
  // if (!hasRequiredRole) {
  //   return next(createError(403, "Forbidden"));
  // }

  console.log("Authorized User Roles: ", req.user.role);
  console.log("Authorized User Roles2: ", req.user.roles);

  //========== new authorize ==========
  const r = req.user?.role || req.user?.roles || [];
  const userRoles = Array.isArray(r) ? r : [r];
  const ok = requiredRoles.some((role) => userRoles.includes(role));
  if (!ok) return next(createError(403, "Forbidden"));
  //===================================

  

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
      },
    });

    if (!user) return res.status(401).json({ message: "User not found" });

    // ดึง role names จาก userRoles
    const roleNames = (user.userRoles || [])
      .map((ur) => ur.role?.name)
      .filter(Boolean);

    // ✅ ฝัง role ลง req.user ให้ authorize ใช้ได้ทันที
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

module.exports = { authenticate, authorize };
