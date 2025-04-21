// routes/lookup-route.js
const express = require("express");
const router = express.Router();
const adminController = require("../controllers/admin-controller");

router.get("/departments",  adminController.departmentList);
router.get("/organizations", adminController.organizationList);
router.get("/personnel-types", adminController.getAllPersonnelType);
router.get("/employment-types", adminController.employmentTypeList); // enum คงที่

module.exports = router;
