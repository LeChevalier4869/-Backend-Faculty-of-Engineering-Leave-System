const express = require('express');
const router = express.Router();
const settingController = require('../controllers/setting-controller');

router.post('/', settingController.createSetting);
router.get('/', settingController.getAllSetting);
router.get('/get/:id', settingController.getSettingById);
router.put('/update/:id', settingController.updateSetting);
router.delete('/delete/:id', settingController.deleteSetting);
router.get("/by/:key", settingController.getSettingByKey);

module.exports = router;
