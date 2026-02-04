const express = require("express");
const router = express.Router();
const adminController = require("../controllers/admin-controller");
const upload = require("../middlewares/upload");

router.post("/", upload.single("profilePicture"), adminController.createUserByAdmin);

// Position Number Management Routes
router.put("/users/:userId/position-number", adminController.updateUserPositionNumber);
router.get("/users/:userId/position-number/history", adminController.getUserPositionNumberHistory);
router.get("/users/:userId/position-number/current", adminController.getCurrentPositionNumber);
router.get("/position-numbers/:positionNumber", adminController.getPositionNumberByNumber);

module.exports = router;
