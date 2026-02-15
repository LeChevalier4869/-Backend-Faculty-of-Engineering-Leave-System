const express = require("express");
const router = express.Router();
const adminController = require("../controllers/admin-controller");
const upload = require("../middlewares/upload");

router.post("/", upload.single("profilePicture"), adminController.createUserByAdmin);

// Position Number Management Routes (ไม่ต้องใส่ /users ซ้ำ)
router.put("/:userId/position-number", adminController.updateUserPositionNumber);
router.get("/:userId/position-number/history", adminController.getUserPositionNumberHistory);
router.get("/:userId/position-number/current", adminController.getCurrentPositionNumber);
router.get("/position-numbers/:positionNumber", adminController.getPositionNumberByNumber);

module.exports = router;
