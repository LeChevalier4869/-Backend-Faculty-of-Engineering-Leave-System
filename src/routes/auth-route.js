const express = require('express');
const bcrypt = require("bcrypt");
const router = express.Router();

const passport = require("../config/passport");

const { authenticate, authorize} = require('../middlewares/auth');
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
// router.get('/me', uploadFile.uploadProfile.none(), authenticateJWT, authController.getMe);
router.get('/landing', authController.userLanding);
router.get('/role', authenticate, authController.checkUserRole);
router.get('/user-info/:id', authenticate, authController.getUserInfoById);
router.get('/verifier', authenticate, authController.getVerifier);

// ==============================
// 🔐 Password Management
// ==============================

router.post('/change-password', authController.changePassword);
router.post('/forgot-password', authController.forgotPassword);
router.post('/reset-password', authController.resetPassword);

// ==============================
//      User Management (Admin)
// ==============================

router.post('/update-role/:id', authenticate, authorize(['ADMIN']), authController.updateUserRole);
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
// router.get(
//   "/google/callback",
//   passport.authenticate("google", { failureRedirect: "/auth/fail" }),
//   (req, res) => res.json(req.user)
// );

router.get(
  "/google/callback",
  passport.authenticate("google", { failureRedirect: "/auth/fail", session: false }),
  async (req, res) => {
    const user = req.user;

    // สร้าง JWT
    const { accessToken, refreshToken } = await AuthService.generateTokens(user.id);

    // ✅ redirect ไป frontend (ใช้ env เก็บ URL frontend)
    // const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";
    // console.log("Redirecting to:", `${frontendUrl}/callback?access=${accessToken}&refresh=${refreshToken}`);

    // Redirect ไป frontend For 2 urls
    // define allowed frontends: use always FRONTEND_URL in env
    // add localhost for development purpose (NODE_ENV === 'development')
    const allowedFrontends = [
      "http://localhost:5173",
      process.env.FRONTEND_URL?.trim().replace(/\/+$/, ""),
    ].filter(Boolean); // remove undefined

    // determine target origin
    const requestOrigin = req.headers.origin?.replace(/\/+$/, ""); // remove trailing slash
    let targetOrigin = allowedFrontends.includes(requestOrigin)
      ? requestOrigin
      : allowedFrontends[0]; // default to first allowed frontend

    if (targetOrigin.includes("localhost")) {
      targetOrigin = targetOrigin.replace(/https:\/\//, "http://"); // use http for localhost
    }

    if (!targetOrigin) {
      //protect against open redirect: if no allowed frontend, refuse to redirect
      return res.status(500).send("No allowed frontend URL configured.");
    }

    // set refresh token as HttpOnly cookie
    res.cookie("refreshToken", refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
    });

    const redirectUrl = `${targetOrigin}/callback?access=${encodeURIComponent(accessToken)}`;
    console.log("Redirecting to:", redirectUrl);

    // res.redirect(
    //   `${frontendUrl}/callback?access=${accessToken}&refresh=${refreshToken}`
    // );
    res.redirect(redirectUrl);
  }
);



router.get("/profile", authenticate, async (req, res) => {
  // req.user มีข้อมูล user ที่ login แล้ว
  res.json({ message: "This is protected", user: req.user });
});

router.get("/fail", (req, res) =>
  res.status(401).json({ message: "Login failed" })
);

// Refresh access token
router.post("/refresh", async (req, res) => {
  try {
    const { refreshToken } = req.body;
    const { accessToken, refreshToken: newRefreshToken } =
      await AuthService.refreshToken(refreshToken); // ใช้ฟังก์ชันใน service
    res.json({ accessToken, refreshToken: newRefreshToken });
  } catch (err) {
    res.status(401).json({ error: err.message });
  }
});


// Logout
router.post("/logout", async (req, res) => {
  try {
    const { refreshToken } = req.body;
    console.log("debug req.body:",req.body);
    console.log("debug refresh:",refreshToken);
    if (!refreshToken) return res.status(400).json({ error: "Missing token" });
  
    const tokens = await prisma.refreshToken.findMany({
      where: { revoked: false },
    });
  
    console.log("debug tokens:",tokens);
  
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