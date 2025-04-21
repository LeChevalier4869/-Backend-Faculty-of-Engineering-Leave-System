const router = require("express").Router();
const { authenticate, authorize } = require("../middlewares/auth");
const upload = require("../middlewares/upload");
const authController = require("../controllers/auth-controller");

// POST /admin/users
router.post(
  "/",
  authenticate,
  authorize(["ADMIN"]),
  upload.single("profilePicture"),
  authController.adminCreateUser
);

module.exports = router;
