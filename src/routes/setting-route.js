const express = require('express');
const router = express.Router();
const settingController = require('../controllers/setting-controller');
const { authenticate, authorize } = require('../middlewares/auth');

router.get('/', settingController.getAllSetting);
router.get('/get/:id', settingController.getSettingById);
router.get("/by/:key", settingController.getSettingByKey);
router.post('/', authenticate, authorize(["ADMIN"]), settingController.createSetting);
router.put('/update/:id', authenticate, authorize(["ADMIN"]), settingController.updateSetting);
router.delete('/delete/:id', authenticate, authorize(["ADMIN"]), settingController.deleteSetting);
router.put("/by/:key", authenticate, authorize(["ADMIN"]), settingController.updateSettingByKey);

module.exports = router;
