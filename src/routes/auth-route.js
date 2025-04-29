const express = require('express');
const router = express.Router();

const { authenticate, authorize } = require('../middlewares/auth');
const { loginLimiter, registerLimiter } = require('../middlewares/rateLimit');
const uploadFile = require('../middlewares/fileUpload');
const upload = require("../middlewares/upload");
const authController = require('../controllers/auth-controller');

// ==============================
// 🧑‍💼 Authentication & User
// ==============================

router.post('/register', registerLimiter, upload.single('images'), authController.register);
router.post('/login', loginLimiter, uploadFile.uploadProfile.none(), authController.login);
router.get('/me', uploadFile.uploadProfile.none(), authenticate, authController.getMe);
router.get('/landing', authController.userLanding);
router.get('/role', authenticate, authController.checkUserRole);
router.get('/user-info/:id', authenticate, authController.getUserInfoById);

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
router.put('/users/:is', authenticate, upload.single('images'), authController.updateUser);
router.put('/user-status/:id', authenticate, authController.updateUserStatus);
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
//      Combined Utilities
// ==============================

router.get('/OrgAndDep-list', authenticate, authController.getOrganizationAndDepartment);

// ==============================
//      Google Auth (Optional)
// ==============================

// const passport = require('passport');
// router.get('/google', passport.authenticate('google', { scope: ['profile', 'email'], prompt: 'select_account' }));
// router.get('/google/callback',
//   passport.authenticate('google', { failureRedirect: '/login' }),
//   authController.googleLogin
// );

module.exports = router;
