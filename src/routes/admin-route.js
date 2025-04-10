const express = require('express');
const router = express.Router();
const adminController = require('../controllers/admin-controller');
const upload = require('../middlewares/upload');
const { authorize } = require('../middlewares/auth');

/**
 * @swagger
 * /admin/list:
 *   get:
 *     summary: ดึงข้อมูลผู้ใช้งานที่เป็น admin
 *     tags: [Admin]
 *     security:
 *      - bearerAuth: []
 *     responses:
 *       200:
 *         description: ดึงข้อมูลสำเร็จ
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id:
 *                     type: integer
 *                   email:
 *                     type: string
 *                   name:
 *                     type: string
 *       403:
 *         description: Forbidden (ต้องเป็น ADMIN เท่านั้น)
 */


router.get('/list', adminController.adminList);
router.post('/leave-request', upload.array("images", 5), adminController.createRequestByAdmin);
router.post('/holiday', upload.none(), adminController.addHoliday);
router.get('/holiday', adminController.getHoliday);

//-------------------------------------- approver -------------------- 
router.get('/approver', adminController.approverList);
router.post('/approver', upload.none(), adminController.createApprover);
router.put('/approver/:id', adminController.updateApprover);
router.delete('/approver/:id', adminController.deleteApprover);

module.exports = router;