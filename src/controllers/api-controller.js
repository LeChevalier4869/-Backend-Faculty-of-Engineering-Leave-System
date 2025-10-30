const APIService = require("../services/api-service");
const settingService = require("../services/setting-service");

exports.getContactInfo = async (req, res) => {
  try {
    const contacts = await APIService.getContactInfo();
    res.json(contacts);
  } catch (error) {
    console.error("Error fetching contact info:", error);
    res.status(500).json({ error: "ไม่สามารถดึงข้อมูลได้" });
  }
};

exports.updateContactValue = async (req, res) => {
  try {
    const { key } = req.params;
    const { value } = req.body;

    const updated = await APIService.updateContactValue(key, value);
    res.json(updated);
  } catch (error) {
    if (error.message === "NOT_FOUND") {
      return res.status(404).json({ error: "ไม่พบข้อมูล key นี้" });
    }

    console.error("Error updating contact value:", error);
    res.status(500).json({ error: "ไม่สามารถอัปเดตข้อมูลได้" });
  }
};

exports.getDriveLink = async (req, res) => {
  try {
    const setting = await settingService.getSettingByKey("drive_template");

    if (!setting) {
      return res.status(404).json({ message: "ไม่พบ key: drive_template" });
    }

    res.json({ url: setting.value });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "เกิดข้อผิดพลาดในระบบ" });
  }
};

exports.updateDriveLink = async (req, res) => {
  try {
    const { value } = req.body; // รับ URL ใหม่จาก frontend

    if (!value) {
      return res.status(400).json({ message: "กรุณาส่งค่า value" });
    }

    const updated = await settingService.updateSettingByKey("drive_template", value);

    res.json({
      message: "อัปเดตลิงก์สำเร็จ",
      data: updated,
    });
  } catch (error) {
    console.error(error);
    if (error.code === "P2025") {
      return res.status(404).json({ message: "ไม่พบ key นี้ในระบบ" });
    }
    res.status(500).json({ message: "เกิดข้อผิดพลาดในระบบ" });
  }
};