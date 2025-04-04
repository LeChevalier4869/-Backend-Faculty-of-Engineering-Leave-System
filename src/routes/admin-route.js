const express = require('express');
const router = express.Router();
const adminController = require('../controllers/admin-controller');

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

module.exports = router;