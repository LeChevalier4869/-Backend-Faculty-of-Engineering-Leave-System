const express = require('express');
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const router = express.Router();

const passport = require("../config/passport");

const { authenticate, authorize } = require('../middlewares/auth');
const uploadFile = require('../middlewares/fileUpload');
const upload = require("../middlewares/upload");
const authController = require('../controllers/auth-controller');
const AuthService = require('../services/auth-service');
const prisma = require("../config/prisma");

// ==============================
// 🧑‍💼 Authentication & User
// ==============================

// ระบบใช้ Google OAuth เท่านั้น (manual register/login ถูกถอดออกแล้ว)
router.get('/me', uploadFile.uploadProfile.none(), authenticate, authController.getMe);
router.get('/landing', authController.userLanding);
router.get('/role', authenticate, authController.checkUserRole);
router.get('/user-info/:id', authenticate, authController.getUserInfoById);
router.get('/verifier', authenticate, authController.getVerifier);
// ต้อง login ก่อน — endpoint นี้เปิดเผยรายชื่อและอีเมลผู้อนุมัติทั้งหมด
router.get('/approvers-for-level/:level', authenticate, authController.getApproversForLevel);

// ==============================
//      User Management (Admin)
// ==============================

// ADMIN แก้บทบาทได้เหมือน SUPER_ADMIN แต่ controller (updateUserRole) กันไว้ว่า ผู้ที่ไม่ใช่ SUPER_ADMIN
// จะเพิ่ม/ลบบทบาท SUPER_ADMIN, แก้บทบาทของ SUPER_ADMIN หรือถอด SUPER_ADMIN ของตัวเองไม่ได้
router.post('/update-role/:id', authenticate, authorize(['ADMIN']), authController.updateUserRole);
router.put('/users/:id', authenticate, upload.single('images'), authController.updateUser);
router.patch('/update-picture', authenticate, uploadFile.uploadProfile.single('profilePicturePath'), authController.updateProfile);
router.get('/profile-image/:filename', authController.getProfileImage);
router.delete('/delete-picture', authenticate, authController.deleteProfilePicture);
router.get('/google-profile-picture', authenticate, authController.getGoogleProfilePicture);

// ==============================
//    Organization Management
// ==============================

router.get('/organizations', authenticate, authController.getAllOrganizations);
router.get('/organizations/:id', authenticate, authController.getOrganizationById);
router.post('/organizations', authenticate, authorize(["ADMIN", "SUPER_ADMIN"]), authController.createOrganization);
router.put('/organizations/:id', authenticate, authorize(["ADMIN", "SUPER_ADMIN"]), authController.updateOrganization);
router.delete('/organizations/:id', authenticate, authorize(["ADMIN", "SUPER_ADMIN"]), authController.deleteOrganization);

// ==============================
//     Department Management
// ==============================

router.get('/departments', authenticate, authController.getAllDepartments);
router.get('/departments/:id', authenticate, authController.getDepartmentById);
router.post('/departments', authenticate, authorize(["ADMIN", "SUPER_ADMIN"]), authController.createDepartment);
router.put('/departments/:id', authenticate, authorize(["ADMIN", "SUPER_ADMIN"]), authController.updateDepartment);
router.delete('/departments/:id', authenticate, authorize(["ADMIN", "SUPER_ADMIN"]), authController.deleteDepartment);

// ==============================
//    Personnel Type Management
// ==============================

router.get('/personnel-types', authenticate, authController.getPersonnelTypes);
router.get('/personnel-types/:id', authenticate, authController.getPersonnelTypeById);
router.post('/personnel-types', authenticate, authorize(["ADMIN", "SUPER_ADMIN"]), authController.createPersonnelType);
router.put('/personnel-types/:id', authenticate, authorize(["ADMIN", "SUPER_ADMIN"]), authController.updatePersonnelType);
router.delete('/personnel-types/:id', authenticate, authorize(["ADMIN", "SUPER_ADMIN"]), authController.deletePersonnelType);

// ==============================
//           Position
// ==============================

// ==============================
//      Google Auth (Optional)
// ==============================

// const passport = require('passport');
// router.get('/google', passport.authenticate('google', { scope: ['profile', 'email'], prompt: 'select_account' }));
// router.get('/google/callback',
//   passport.authenticate('google', { failureRedirect: '/login' }),
//   authController.googleLogin
// );



// Login via Google
// prompt: "select_account" บังคับให้ Google แสดงหน้าเลือกบัญชีทุกครั้ง
// ไม่ว่า browser จะ login ค้างด้วยบัญชีไหน ผู้ใช้จึงเลือกอีเมลองค์กร (@rmuti.ac.th) ได้เสมอ
router.get(
  "/google",
  passport.authenticate("google", {
    scope: ["profile", "email"],
    prompt: "select_account",
  })
);

// Google callback
router.get(
  "/google/callback",
  async (req, res, next) => {
    passport.authenticate("google", { session: false }, (err, user, info) => {
      if (err) {
        const isDev = process.env.NODE_ENV !== "production";
        const allowedOrigins = isDev
          ? ["http://localhost:5173"]
          : [process.env.FRONTEND_URL?.trim().replace(/\/+$/, "")].filter(Boolean);

        const targetOrigin = allowedOrigins[0];
        const errorMessage = encodeURIComponent(err.message || "เกิดข้อผิดพลาดในการเข้าสู่ระบบ");

        const failRedirectUrl = `${targetOrigin}/callback?error=${errorMessage}`;
        return res.redirect(failRedirectUrl);
      }

      if (!user) {
        const noUserRedirectUrl = `${process.env.FRONTEND_URL || "http://localhost:5173"}/callback?error=ไม่พบข้อมูลผู้ใช้`;
        return res.redirect(noUserRedirectUrl);
      }

      req.user = user;
      return next();
    })(req, res, next);
  },
  async (req, res) => {
    try {
      const user = req.user;

      const { accessToken, refreshToken } = await AuthService.generateTokens(user.id);

      // ✅ redirect ไป frontend (ใช้ env เก็บ URL frontend)
      const isDev = process.env.NODE_ENV !== "production";
      const allowedOrigins = isDev
        ? ["http://localhost:5173"]
        : [process.env.FRONTEND_URL?.trim().replace(/\/+$/, "")].filter(Boolean);

      if (!allowedOrigins.length) {
        return res.status(500).send("No allowed frontend URL configured.");
      }

      const requestOrigin = req.headers.origin?.replace(/\/+$/, "");

      let targetOrigin;
      if (requestOrigin && allowedOrigins.includes(requestOrigin)) {
        targetOrigin = requestOrigin;
      } else {
        targetOrigin = allowedOrigins[0];
      }

      if (targetOrigin.includes("localhost")) {
        targetOrigin = targetOrigin.replace(/^https:\/\//, "http://");
      }

      // set refresh token as HttpOnly cookie
      res.cookie("refreshToken", refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
      });

      const redirectUrl = `${targetOrigin}/callback?access=${encodeURIComponent(accessToken)}`;
      res.redirect(redirectUrl);
    } catch (err) {
      console.error("Error in Google OAuth callback:", err);

      // เมื่อเกิด error ใน callback ให้ redirect ไป frontend พร้อม error info
      const isDev = process.env.NODE_ENV !== "production";
      const allowedOrigins = isDev
        ? ["http://localhost:5173"]
        : [process.env.FRONTEND_URL?.trim().replace(/\/+$/, "")].filter(Boolean);

      const targetOrigin = allowedOrigins[0];
      const errorMessage = encodeURIComponent(err.message || "เกิดข้อผิดพลาดในการเข้าสู่ระบบ");

      const failRedirectUrl = `${targetOrigin}/callback?error=${errorMessage}`;
      console.log("Error redirecting to:", failRedirectUrl);

      res.redirect(failRedirectUrl);
    }
  }
);

router.get("/profile", authenticate, async (req, res) => {
  // req.user มีข้อมูล user ที่ login แล้ว
  res.json({ message: "This is protected", user: req.user });
});

router.get("/fail", (req, res) => {
  // หมายเหตุ: ไม่ log req.headers เพราะมี Authorization token (ข้อมูลอ่อนไหว)
  res.status(401).json({ message: "Login failed" });
});

// Refresh access token
router.post("/refresh", async (req, res) => {
  try {
    const { refreshToken } = req.body;
    const { accessToken, refreshToken: newRefreshToken } = await AuthService.refreshToken(refreshToken);
    res.json({ accessToken, refreshToken: newRefreshToken });
  } catch (err) {
    res.status(401).json({ error: err.message });
  }
});

// Logout
router.post("/logout", async (req, res) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) return res.status(400).json({ error: "Missing token" });

    // verify เพื่อหา userId แล้ว query เฉพาะ token ของ user นั้น
    // (ไม่ดึง refresh token ทั้ง DB มา compare ทีละตัว ซึ่งช้าและกิน CPU)
    let userId;
    try {
      const payload = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
      userId = payload.userId;
    } catch {
      return res.status(400).json({ error: "Invalid token" });
    }

    const tokens = await prisma.refreshToken.findMany({
      where: { userId, revoked: false },
    });

    for (const t of tokens) {
      if (await bcrypt.compare(refreshToken, t.tokenHash)) {
        await prisma.refreshToken.update({
          where: { id: t.id },
          data: { revoked: true },
        });
        return res.json({ message: "Logged out" });
      }
    }

    res.status(400).json({ error: "Invalid token" });
  } catch (err) {
    console.error("Logout error:", err);
    res.status(500).json({ error: "Logout failed" });
  }
});

module.exports = router;