const express = require('express');
const { authenticate, authorize } = require('../middlewares/auth');
const authController = require('../controllers/auth-controller');
const uploadFile = require('../middlewares/fileUpload');
const router = express.Router();
const upload = require("../middlewares/upload");

router.post('/register', upload.single('images'), authController.register);
//router.post('/register', uploadFile.uploadProfile.none(), authController.register);
router.post('/login', uploadFile.uploadProfile.none(), authController.login);
router.get('/me', uploadFile.uploadProfile.none(), authenticate, authController.getMe);
router.get('/landing', authController.userLanding);
router.get('/role', authenticate, authController.checkUserRole);
//router.post('/:id/role', authMiddleware.authenticate, uploadFile.uploadProfile.none(), authController.updateUserRole);

router.post('/:id/role', authenticate, authorize(['ADMIN']), authController.updateUserRole);
router.put('/users/:id', authenticate, authController.updateUser);
router.put('/user-status/:id', authenticate, authController.updateUserStatus);

// error
router.patch('/update-picture', authenticate, uploadFile.uploadProfile.single('profilePicturePath'), authController.updateProfile);

module.exports = router;