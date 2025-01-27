const express = require('express');
const authMiddleware = require('../middlewares/auth');
const authController = require('../controllers/auth-controller');
const uploadFile = require('../middlewares/fileUpload');
const router = express.Router();

router.post('/register', uploadFile.uploadProfile.none(), authController.register);
router.post('/login', uploadFile.uploadProfile.none(), authController.login);
router.get('/me', uploadFile.uploadProfile.none(), authMiddleware.authenticate, authController.getMe);
router.get('/landing', authController.userLanding);
router.post('/:id/role', authMiddleware.authenticate, uploadFile.uploadProfile.none(), authController.updateUserRole);

router.post('/:id/role', authMiddleware.authenticate, authMiddleware.authorize(['ADMIN']), authController.updateUserRole);

// error
router.patch('/update-picture', authMiddleware.authenticate, uploadFile.uploadProfile.single('profilePicturePath'), authController.updateProfile);

module.exports = router;