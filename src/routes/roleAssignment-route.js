const express = require("express");
const RoleAssignmentController = require("../controllers/roleAssignment-controller");
const router = express.Router();

router.post("/", RoleAssignmentController.setAssignment);  
router.get("/", RoleAssignmentController.getAssignments); 
router.delete("/", RoleAssignmentController.deleteAssignment);  

module.exports = router;
