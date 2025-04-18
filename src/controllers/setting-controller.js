const settingService = require("../services/setting-service");

exports.createSetting = async (req, res) => {
  try {
    if (!req.body.key || !req.body.type || !req.body.value) {
      const error = new Error("กรุณากรอกข้อมูลให้ครบถ้วน");
      error.status = 400;
      throw error;
    }

    const setting = await settingService.createSetting(req.body);
    res.json(setting);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getAllSetting = async (req, res) => {
  try {
    const settings = await settingService.getAllSettings();
    res.json(settings);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getSettingById = async (req, res) => {
  try {
    const setting = await settingService.getSettingById(req.params.id);
    if (!setting) return res.status(404).json({ error: "Setting not found" });
    res.json(setting);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.updateSetting = async (req, res) => {
  try {
    const setting = await settingService.updateSetting(req.params.id, req.body);
    res.json(setting);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.deleteSetting = async (req, res) => {
  try {
    await settingService.deleteSetting(req.params.id);
    res.json({ message: "ลบค่าในระบบเสร็จสิ้น" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
