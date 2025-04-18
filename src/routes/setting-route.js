const express = require('express');
const router = express.Router();
const settingController = require('../controllers/setting-controller');

router.post('/', settingController.createSetting);
router.get('/', settingController.getAllSetting);
router.get('/:id', settingController.getSettingById);
router.put('/:id', settingController.updateSetting);
router.delete('/:id', settingController.deleteSetting);

module.exports = router;
