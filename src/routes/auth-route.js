const express = require('express');
const { authenticate, authorize } = require('../middlewares/auth');
const authController = require('../controllers/auth-controller');
const uploadFile = require('../middlewares/fileUpload');
const router = express.Router();
const upload = require("../middlewares/upload");
const { loginLimiter, registerLimiter } = require('../middlewares/rateLimit');
// const passport = require('passport');

router.post('/register', registerLimiter, upload.single('images'), authController.register);
//router.post('/register', uploadFile.uploadProfile.none(), authController.register);
router.post('/login', loginLimiter, uploadFile.uploadProfile.none(), authController.login);
router.get('/me', uploadFile.uploadProfile.none(), authenticate, authController.getMe);
router.get('/landing', authController.userLanding);
router.get('/role', authenticate, authController.checkUserRole);
//router.post('/:id/role', authMiddleware.authenticate, uploadFile.uploadProfile.none(), authController.updateUserRole);

router.post('/update-role/:id', authenticate, authorize(['ADMIN']), authController.updateUserRole);
router.put('/users', authenticate, upload.single('images'), authController.updateUser);
router.put('/user-status/:id', authenticate, authController.updateUserStatus);

router.get('/user-info/:id', authenticate, authController.getUserInfoById);

// error
router.patch('/update-picture', authenticate, uploadFile.uploadProfile.single('profilePicturePath'), authController.updateProfile);

//google
// router.get('/google', passport.authenticate('google', { scope: ['profile', 'email'], prompt: 'select_account', /* ให้เลือกบัญชีทุกครั้ง*/ }));
// router.get('/google/callback',
//     passport.authenticate('google', { failureRedirect: '/login' }),
//     authController.googleLogin
// );

//organizations---------------------------------------------------
router.get('/organizations', authController.getAllOrganizations);
router.get('/organizations/:id', authController.getOrganizationById);
router.post('/organizations', authController.createOrganization);
router.put('/organizations/:id', authController.updateOrganization);
router.delete('/organizations/:id', authController.deleteOrganization);

//departments---------------------------------------------------
router.get('/departments', authController.getAllDepartments);
router.get('/departments/:id', authController.getDepartmentById);
router.post('/departments', authController.createDepartment);
router.put('/departments/:id', authController.updateDepartment);
router.delete('/departments/:id', authController.deleteDepartment);

//personnel-types---------------------------------------------------
router.get("/personnel-types", authController.getPersonnelTypes);
router.get("/personnel-types/:id", authController.getPersonnelTypeById);
router.post("/personnel-types", authController.createPersonnelType);
router.put("/personnel-types/:id", authController.updatePersonnelType);
router.delete("/personnel-types/:id", authController.deletePersonnelType);


router.get('/OrgAndDep-list', authenticate, authController.getOrganizationAndDepartment);

//reset pass
router.post("/change-password", authController.changePassword);
router.post("/forgot-password", authController.forgotPassword);
router.post("/reset-password", authController.resetPassword);


module.exports = router;