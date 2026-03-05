const settingService = require("../services/setting-service");
const AuditLogService = require("../services/auditLog-service");

exports.createSetting = async (req, res, next) => {
  try {
    if (!req.body.key || !req.body.type || !req.body.value) {
      const error = new Error("กรุณากรอกข้อมูลให้ครบถ้วน");
      error.status = 400;
      throw error;
    }

    const setting = await settingService.createSetting(req.body);

    await AuditLogService.createLog(
      req.user.id,
      "CREATE",
      "Setting",
      setting.id,
      `สร้าง Setting: ${req.body.key} = ${req.body.value}`,
      req.ip,
      req.get('User-Agent')
    );

    res.json(setting);
  } catch (err) {
    next(err);
  }
};

exports.getSettingByKey = async (req, res, next) => {
  try {
    const { key } = req.params;
    const setting = await settingService.getSettingByKey(key);

    if (!setting) {
      return res.status(404).json({ message: "Setting not found" });
    }

    res.json({ data: setting });
  } catch (err) {
    next(err);
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

exports.updateSetting = async (req, res, next) => {
  try {
    const oldSetting = await settingService.getSettingById(req.params.id);
    const setting = await settingService.updateSetting(req.params.id, req.body);

    await AuditLogService.createUpdateLog(
      req.user.id,
      "Setting",
      setting.id,
      oldSetting,
      setting,
      req.ip,
      req.get('User-Agent')
    );

    res.json(setting);
  } catch (err) {
    next(err);
  }
};

exports.updateSettingByKey = async (req, res, next) => {
  try {
    const { key } = req.params;
    const { value, type, description } = req.body;

    const oldSetting = await settingService.getSettingByKey(key);
    const setting = await settingService.updateSettingByKey(key, {
      value,
      type,
      description
    });

    if (!setting) {
      return res.status(404).json({ message: "Setting not found" });
    }

    if (oldSetting) {
      await AuditLogService.createUpdateLog(
        req.user.id,
        "Setting",
        setting.id,
        oldSetting,
        setting,
        req.ip,
        req.get('User-Agent')
      );
    } else {
      await AuditLogService.createLog(
        req.user.id,
        "CREATE",
        "Setting",
        setting.id,
        `สร้าง Setting: ${key} = ${value}`,
        req.ip,
        req.get('User-Agent')
      );
    }

    res.json({ data: setting });
  } catch (err) {
    next(err);
  }
};

exports.deleteSetting = async (req, res, next) => {
  try {
    const oldSetting = await settingService.getSettingById(req.params.id);
    await settingService.deleteSetting(req.params.id);

    await AuditLogService.createLog(
      req.user.id,
      "DELETE",
      "Setting",
      parseInt(req.params.id),
      `ลบ Setting: ${oldSetting?.key || 'unknown'} (ID: ${req.params.id})`,
      req.ip,
      req.get('User-Agent')
    );

    res.json({ message: "ลบค่าในระบบเสร็จสิ้น" });
  } catch (err) {
    next(err);
  }
};
