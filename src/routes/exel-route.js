const express = require("express");
const multer = require("multer");
const router = express.Router();
const { uploadUserExcel } = require("../controllers/exel-controller");

const storage = multer.memoryStorage();
const upload = multer({ storage });

router.post("/upload-users", upload.single("file"), uploadUserExcel);

module.exports = router;
