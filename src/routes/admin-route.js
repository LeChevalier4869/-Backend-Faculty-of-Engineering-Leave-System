const express = require('express');
const router = express.Router();
const adminController = require('../controllers/admin-controller');
const upload = require('../middlewares/upload');
const authController = require('../controllers/auth-controller');
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


router.get('/list', authorize(["ADMIN"]), adminController.adminList);
router.post('/leave-request', upload.array("images", 5), authorize(["ADMIN"]), adminController.createRequestByAdmin);

//-------------------------------------- holiday -------------------- 
router.get('/holiday', authorize(["USER", "ADMIN"]), adminController.getHoliday);
router.post('/holiday', upload.none(), authorize(["ADMIN"]), adminController.addHoliday);
router.put('/holiday/:id', authorize(["ADMIN"]), adminController.updateHoliday);
router.delete('/holiday/:id', authorize(["ADMIN"]), adminController.deleteHoliday);


//-------------------------------------- approver -------------------- 
router.get('/approver', authorize(["ADMIN"]), adminController.approverList);
router.post('/approver', upload.none(), authorize(["ADMIN"]), adminController.createApprover);
router.put('/approver/:id', authorize(["ADMIN"]), adminController.updateApprover);
router.delete('/approver/:id', authorize(["ADMIN"]), adminController.deleteApprover);

//------------------------------------ Manage user -----------------
router.get(
  '/users',
  authorize(['ADMIN']),
  adminController.getAllUsers
);
router.get('/users/:id', authorize(["ADMIN"]), adminController.getUserById);
router.post("/create-user", authorize(["ADMIN"]), upload.single("profilePicture"), adminController.createUserByAdmin);
router.put('/users/:id', authorize(['ADMIN']), adminController.updateUserById);
router.delete('/users/:id', authorize(['ADMIN']), adminController.deleteUser);


//------------------------------------- role ----------------------------------
router.get('/role', authorize(["ADMIN"]), adminController.roleList);
router.get('/role/:id', authorize(["ADMIN"]), adminController.getRoleById);
router.post('/role', authorize(["ADMIN"]), adminController.createRole);
router.put('/role/:id', authorize(["ADMIN"]), adminController.updateRole);
router.delete('/role/:id', authorize(["ADMIN"]), adminController.deleteRole);

//------------------------------------- Assign Head department ----------------------------------
router.post("/assign-head", authorize(["ADMIN"]), adminController.assignHeadDepartment);

//-------------------------------------- rank --------------------------------
router.get('/rank', authorize(["ADMIN"]), adminController.getAllRank);
router.get('/rank/:id', authorize(["ADMIN"]), adminController.getRankById);
router.post('/rank', authorize(["ADMIN"]), adminController.createRank);
router.put('/rank/:id', authorize(["ADMIN"]), adminController.updateRank);
router.delete('/rank/:id', authorize(["ADMIN"]), adminController.deleteRank);

//---------------------------------- personnelType -----------------------
router.get('/personnel-types', authorize(["ADMIN"]), adminController.getAllPersonnelType);
router.get('/personnel-type/:id', authorize(["ADMIN"]), adminController.getPersonnelTypeById);
router.post('/personnel-type', authorize(["ADMIN"]), adminController.createPersonnelType);
router.put('/personnel-type/:id', authorize(["ADMIN"]), adminController.updatePersonnelType);
router.delete('/personnel-type/:id', authorize(["ADMIN"]), adminController.deletePersonnelType);

//---------------------------------- department -----------------------
router.get('/departmentsList', authorize(["ADMIN"]), adminController.departmentList);
router
  .route("/departments")
  .get(authorize(["ADMIN"]), adminController.departmentList)
  .post(authorize(["ADMIN"]), adminController.departmentCreate);

router
  .route("/departments/:id")
  .put(authorize(["ADMIN"]), adminController.departmentUpdate)
  .delete(authorize(["ADMIN"]), adminController.departmentDelete);

//---------------------------------- organization -----------------------
router.get('/organizations', authorize(["ADMIN"]), authController.getAllOrganizations);
router.get('/organizations/:id', authorize(["ADMIN"]), authController.getOrganizationById);
router.post('/organizations', authorize(["ADMIN"]), authController.createOrganization);
router.put('/organizations/:id', authorize(["ADMIN"]), authController.updateOrganization);
router.delete('/organizations/:id', authorize(["ADMIN"]), authController.deleteOrganization);

  //---------------------------------- employmentType -----------------------
router.get('/organizations', authorize(["ADMIN"]), adminController.organizationList);
router.post("/create-user", upload.single("profilePicture"), authorize(["ADMIN"]), adminController.createUserByAdmin);

 //---------------------------------- setting -----------------------
router.post('/setting', authorize(["ADMIN"]), adminController.createSetting);
router.get('/setting', authorize(["ADMIN"]), adminController.getAllSetting);
router.get('/setting/:id', authorize(["ADMIN"]), adminController.getSettingById);
router.put('/setting/:id', authorize(["ADMIN"]), adminController.updateSetting);
router.delete('/setting/:id', authorize(["ADMIN"]), adminController.deleteSetting);

module.exports = router;
