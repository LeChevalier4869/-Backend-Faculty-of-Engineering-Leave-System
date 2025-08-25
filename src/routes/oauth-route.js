const express = require("express");
const router = express.Router();
const passport = require("../config/passport");
const { refreshAccessToken } = require("../utils/token");

// Login via Google
router.get(
  "/google",
  passport.authenticate("google", { scope: ["profile", "email"] })
);

// Google callback
router.get(
  "/google/callback",
  passport.authenticate("google", { failureRedirect: "/auth/fail" }),
  (req, res) => res.json(req.user)
);

router.get("/profile", authenticateJWT, async (req, res) => {
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
    const accessToken = await refreshAccessToken(refreshToken);
    res.json({ accessToken });
  } catch (err) {
    res.status(401).json({ error: err.message });
  }
});

// Logout
router.post("/logout", async (req, res) => {
  const { refreshToken } = req.body;
  await prisma.refreshToken.updateMany({
    where: { revoked: false },
    data: { revoked: true },
  });
  res.json({ message: "Logged out" });
});

module.exports = router;
