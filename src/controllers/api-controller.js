const APIService = require("../services/api-service");

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