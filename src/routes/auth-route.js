const express = require('express');
const bcrypt = require("bcryptjs");
const router = express.Router();

const passport = require("../config/passport");

const { authenticate, authorize, optionalAuth } = require('../middlewares/auth');
const { loginLimiter, registerLimiter } = require('../middlewares/rateLimit');
const uploadFile = require('../middlewares/fileUpload');
const upload = require("../middlewares/upload");
const authController = require('../controllers/auth-controller');
const AuthService = require('../services/auth-service');
const prisma = require("../config/prisma");

// ==============================
// 🧑‍💼 Authentication & User
// ==============================

// "register", "login" เปลี่ยนไปใช้ "google login"
router.post('/register', registerLimiter, upload.single('images'), authController.register);
router.post('/login', loginLimiter, uploadFile.uploadProfile.none(), authController.login);
router.get('/me', uploadFile.uploadProfile.none(), authenticate, authController.getMe);
router.get('/landing', authController.userLanding);
router.get('/role', authenticate, authController.checkUserRole);
router.get('/user-info/:id', authenticate, authController.getUserInfoById);
router.get('/verifier', authenticate, authController.getVerifier);
router.get('/approvers-for-level/:level', optionalAuth, authController.getApproversForLevel); // ใช้ optionalAuth สำหรับ testing

// ==============================
// 🔐 Password Management
// ==============================

router.post('/change-password', authController.changePassword);
router.post('/forgot-password', authController.forgotPassword);
router.post('/reset-password', authController.resetPassword);

// ==============================
//      User Management (Admin)
// ==============================

router.post('/update-role/:id', authenticate, authorize(['SUPER_ADMIN']), authController.updateUserRole);
router.put('/users/:id', authenticate, upload.single('images'), authController.updateUser);
router.patch('/update-picture', authenticate, uploadFile.uploadProfile.single('profilePicturePath'), authController.updateProfile);

// ==============================
//    Organization Management
// ==============================

router.get('/organizations', authController.getAllOrganizations);
router.get('/organizations/:id', authController.getOrganizationById);
router.post('/organizations', authController.createOrganization);
router.put('/organizations/:id', authController.updateOrganization);
router.delete('/organizations/:id', authController.deleteOrganization);

// ==============================
//     Department Management
// ==============================

router.get('/departments', authController.getAllDepartments);
router.get('/departments/:id', authController.getDepartmentById);
router.post('/departments', authController.createDepartment);
router.put('/departments/:id', authController.updateDepartment);
router.delete('/departments/:id', authController.deleteDepartment);

// ==============================
//    Personnel Type Management
// ==============================

router.get('/personnel-types', authController.getPersonnelTypes);
router.get('/personnel-types/:id', authController.getPersonnelTypeById);
router.post('/personnel-types', authController.createPersonnelType);
router.put('/personnel-types/:id', authController.updatePersonnelType);
router.delete('/personnel-types/:id', authController.deletePersonnelType);

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
router.get(
  "/google",
  passport.authenticate("google", { scope: ["profile", "email"] })
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
  console.log("=== /auth/fail route called ===");
  console.log("Query params:", req.query);
  console.log("Headers:", req.headers);
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

    const tokens = await prisma.refreshToken.findMany({
      where: { revoked: false },
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
    console.error(err);
  }
});

module.exports = router;