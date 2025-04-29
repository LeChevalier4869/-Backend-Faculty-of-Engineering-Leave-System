const express = require('express');
const router = express.Router();
const adminController = require('../controllers/admin-controller');
const upload = require('../middlewares/upload');
const { authenticate , authorize } = require('../middlewares/auth');

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

//------------------------------------ Manage user -----------------
router.get(
  '/users',
  authenticate,
  authorize(['ADMIN']),
  adminController.getAllUsers
);
router.get('/users/:id', authenticate, authorize(["ADMIN"]), adminController.getUserById);
router.post("/create-user", authenticate, authorize(["ADMIN"]), upload.single("profilePicture"), adminController.createUserByAdmin);
router.put('/users/:id', authenticate, authorize(['ADMIN']), adminController.updateUserById);
router.delete('/users/:id', authenticate, authorize(['ADMIN']), adminController.deleteUser);


//------------------------------------- role ----------------------------------
router.get('/role', adminController.roleList);
router.get('/role/:id', adminController.getRoleById);
router.post('/role', adminController.createRole);
router.put('/role/:id', adminController.updateRole);
router.delete('/role/:id', adminController.deleteRole);

//------------------------------------- Assign Head department ----------------------------------
router.post("/assign-head", adminController.assignHeadDepartment);

//-------------------------------------- rank --------------------------------
router.get('/rank', adminController.getAllRank);
router.get('/rank/:id', adminController.getRankById);
router.post('/rank', adminController.createRank);
router.put('/rank/:id', adminController.updateRank);
router.delete('/rank/:id', adminController.deleteRank);

//---------------------------------- personnelType -----------------------
router.get('/personnel-types', adminController.getAllPersonnelType);
router.get('/personnelType/:id', adminController.getPersonnelTypeById);
router.post('/personnelType', adminController.createPersonnelType);
router.put('/personnelType/:id', adminController.updatePersonnelType);
router.delete('/personnelType/:id', adminController.deletePersonnelType);

//---------------------------------- department -----------------------
router.get('/departmentsList', adminController.departmentList);
router
  .route("/departments")
  .get(authenticate, authorize(["ADMIN"]), adminController.departmentList)
  .post(authenticate, authorize(["ADMIN"]), adminController.departmentCreate);

router
  .route("/departments/:id")
  .put(authenticate, authorize(["ADMIN"]), adminController.departmentUpdate)
  .delete(authenticate, authorize(["ADMIN"]), adminController.departmentDelete);

//---------------------------------- employmentType -----------------------
router.get('/organizations', adminController.organizationList);
router.post("/create-user", upload.single("profilePicture"), adminController.createUserByAdmin);

module.exports = router;
