const express = require('express');
const router = express.Router();
const adminController = require('../controllers/admin-controller');
const upload = require('../middlewares/upload');
const { authorize } = require('../middlewares/auth');

/**
 * @swagger
 * /admin/list:
 *   get:
 *     summary: ดึงข้อมูล admin
 *     description: ดึงข้อมูลผู้ใช่งานที่เป็น admin
 *     tags: [Admin]
 *     requestBody:
 *       required: false
 *     responses:
 *       200:
 *         description: ดึงข้อมูลสำเร็จ
 *       400:
 *         description: ไม่สามารถดึงข้อมูลได้
 */

router.get('/list', adminController.adminList);
router.get('/list', authorize(['ADMIN']), adminController.adminList);
router.post('/leave-request', authorize(['ADMIN']), upload.array("images", 5), adminController.createRequestByAdmin);
router.post('/holiday', authorize(['ADMIN']), upload.none(), adminController.addHoliday);
router.get('/holiday', adminController.getHoliday);

module.exports = router;