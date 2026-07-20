// routes/user-route.js
const express       = require('express');
const { authenticate, authorize } = require('../middlewares/auth');
const authController = require('../controllers/auth-controller');
const upload         = require("../middlewares/upload");

const router = express.Router();

// ระบบใช้ Google OAuth เท่านั้น (manual register/login ถูกถอดออกแล้ว)

// me, landing, role
router.get("/me", authenticate, authController.getMe);
router.get("/landing", authController.userLanding);
router.get("/role", authenticate, authController.checkUserRole);

// update role
router.post(
  "/update-role/:id",
  authenticate,
  authorize(["SUPER_ADMIN"]),
  authController.updateUserRole
);

// update user profile + รูป
router.put(
  "/users",
  authenticate,
  upload.single("profilePicture"),
  authController.updateUser
);

// update status
// router.put("/user-status/:id", authenticate, authController.updateUserStatus);

// get info by id
router.get("/user-info/:id", authenticate, authController.getUserInfoById);

// เปลี่ยนรูป profile โดยเฉพาะ
router.patch(
  "/update-picture",
  authenticate,
  upload.single("profilePicture"),
  authController.updateProfile
);

// --- ส่วน organizations, departments, personnel-types, reset-password
// --- ให้เหมือนเดิม ไม่ต้องแตะ multipart

const adminRoles = authorize(["ADMIN", "SUPER_ADMIN"]);

router.get('/organizations',              authenticate, authController.getAllOrganizations);
router.get('/organizations/:id',          authenticate, authController.getOrganizationById);
router.post('/organizations',             authenticate, adminRoles, authController.createOrganization);
router.put('/organizations/:id',          authenticate, adminRoles, authController.updateOrganization);
router.delete('/organizations/:id',       authenticate, adminRoles, authController.deleteOrganization);

router.get('/departments',                authenticate, authController.getAllDepartments);
router.get('/departments/:id',            authenticate, authController.getDepartmentById);
router.post('/departments',               authenticate, adminRoles, authController.createDepartment);
router.put('/departments/:id',            authenticate, adminRoles, authController.updateDepartment);
router.delete('/departments/:id',         authenticate, adminRoles, authController.deleteDepartment);

router.get("/personnel-types",            authenticate, authController.getPersonnelTypes);
router.get("/personnel-types/:id",        authenticate, authController.getPersonnelTypeById);
router.post("/personnel-types",           authenticate, adminRoles, authController.createPersonnelType);
router.put("/personnel-types/:id",        authenticate, adminRoles, authController.updatePersonnelType);
router.delete("/personnel-types/:id",     authenticate, adminRoles, authController.deletePersonnelType);

router.get("/all-approver", authenticate, authController.getAllApprover);

// get approvers for level with proxy support
router.get("/approvers-for-level/:level", authenticate, authController.getApproversForLevel);

module.exports = router;
