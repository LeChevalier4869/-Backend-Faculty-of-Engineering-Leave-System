const express = require("express");
const router = express.Router();
const adminController = require("../controllers/admin-controller");
const upload = require("../middlewares/upload");

router.post("/", upload.single("profilePicture"), adminController.createUserByAdmin);

module.exports = router;
