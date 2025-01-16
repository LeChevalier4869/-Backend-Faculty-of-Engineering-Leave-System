const express = require('express');
const authMiddleware = require('../middlewares/auth');
const authController = require('../controllers/auth-controller');
const uploadFile = require('../middlewares/fileUpload');
const router = express.Router();

router.post('/register', authController.register);
router.post('/login', authController.login);
router.get('/me', authMiddleware.authenticate, authController.getMe);
router.get('/landing', authController.userLanding);

// error
router.patch('/update-picture', authMiddleware.authenticate, uploadFile.uploadProfile.single('profilePicturePath'), authController.updateProfile);

module.exports = router;