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

router.get('/organizations',              authController.getAllOrganizations);
router.get('/organizations/:id',          authController.getOrganizationById);
router.post('/organizations',             authController.createOrganization);
router.put('/organizations/:id',          authController.updateOrganization);
router.delete('/organizations/:id',       authController.deleteOrganization);

router.get('/departments',                authController.getAllDepartments);
router.get('/departments/:id',            authController.getDepartmentById);
router.post('/departments',               authController.createDepartment);
router.put('/departments/:id',            authController.updateDepartment);
router.delete('/departments/:id',         authController.deleteDepartment);

router.get("/personnel-types",            authController.getPersonnelTypes);
router.get("/personnel-types/:id",        authController.getPersonnelTypeById);
router.post("/personnel-types",           authController.createPersonnelType);
router.put("/personnel-types/:id",        authController.updatePersonnelType);
router.delete("/personnel-types/:id",     authController.deletePersonnelType);

router.get("/all-approver", authController.getAllApprover);

// get approvers for level with proxy support
router.get("/approvers-for-level/:level", authController.getApproversForLevel);

module.exports = router;
