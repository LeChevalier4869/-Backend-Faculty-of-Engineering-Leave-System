const express = require("express");
const router = express.Router();
const RankController = require("../controllers/rank-controller");
const { authenticate, authorize } = require("../middlewares/auth");

router.get("/", authenticate, authorize(["SUPER_ADMIN"]), RankController.getAllRanks);
router.get("/:id", authenticate, authorize(["SUPER_ADMIN"]), RankController.getRankById);
router.post("/", authenticate, authorize(["SUPER_ADMIN"]), RankController.createRank);
router.put("/:id", authenticate, authorize(["SUPER_ADMIN"]), RankController.updateRank);
router.delete("/:id", authenticate, authorize(["SUPER_ADMIN"]), RankController.deleteRank);

module.exports = router;
