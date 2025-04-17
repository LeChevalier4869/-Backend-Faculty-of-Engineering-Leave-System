const express = require('express');
const router = express.Router();
const adminController = require('../controllers/admin-controller');
const upload = require('../middlewares/upload');
const { authorize } = require('../middlewares/auth');

/**
//  * @swagger
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

//-------------------------------------- holiday -------------------- 
router.get('/holiday', adminController.getHoliday);
router.post('/holiday', upload.none(), adminController.addHoliday);
router.put('/holiday/:id',adminController.updateHoliday);
router.delete('/holiday/:id',adminController.deleteHoliday);


//-------------------------------------- approver -------------------- 
router.get('/approver', adminController.approverList);
router.post('/approver', upload.none(), adminController.createApprover);
router.put('/approver/:id', adminController.updateApprover);
router.delete('/approver/:id', adminController.deleteApprover);

//------------------------------------ delete user -----------------
// router.delete("/user/:id", adminController.);

//------------------------------------- role ----------------------------------
router.get('/role', adminController.roleList);
router.get('/role/:id', adminController.getRoleById);
router.post('/role', adminController.createRole);
router.put('/role/:id', adminController.updateRole);
router.delete('/role/:id', adminController.deleteRole);

//------------------------------------- Assign Head epartment ----------------------------------
router.post("/assign-head", adminController.assignHeadDepartment);

module.exports = router;