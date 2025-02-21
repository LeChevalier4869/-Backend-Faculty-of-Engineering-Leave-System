const express = require('express');
const router = express.Router();
const adminController = require('../controllers/admin-controller');
const upload = require('../middlewares/upload');
const { authorize } = require('../middlewares/auth');

router.get('/list', authorize(['ADMIN']), adminController.adminList);
router.post('/leave-request', authorize(['ADMIN']), upload.array("images", 5), adminController.createRequestByAdmin);
router.post('/holiday', authorize(['ADMIN']), upload.none(), adminController.addHoliday);
router.get('/holiday', adminController.getHoliday);

module.exports = router;