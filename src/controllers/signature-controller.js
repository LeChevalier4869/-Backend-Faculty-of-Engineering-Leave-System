const signatureService = require("../services/signature-service");
const cloudUpload = require("../utils/cloudUpload");

exports.createSignature = async (req, res) => {
  try {
    const { userId } = req.body;

    const file = req.file;
    if (!file) {
      return res.status(400).json({ error: "กรุณาอัปโหลดไฟล์ลายเซ็น" });
    }

    const imgUrl = await cloudUpload(file.path);
    const signature = await signatureService.createSignature(
      parseInt(userId),
      imgUrl
    );

    res.status(201).json(signature);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
};

exports.getAllSignature = async (req, res) => {
  try {
    const signatures = await signatureService.getAllSignature();
    res.json(signatures);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getSignatureById = async (req, res) => {
  try {
    const signature = await signatureService.getSignatureById(req.params.id);
    res.json(signature);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
};

exports.updateSignature = async (req, res) => {
  try {
    const { id } = req.params;
    const { userId } = req.body;
    const file = req.file;

    const dataToUpdate = {};

    // ถ้ามี userId ส่งมา ให้แปลงเป็น int
    if (userId) {
      dataToUpdate.userId = parseInt(userId);
    }

    // ถ้ามีไฟล์แนบ ให้ upload แล้วใช้ URL
    if (file) {
      const imgUrl = await cloudUpload(file.path);
      dataToUpdate.file = imgUrl;
    }

    const signature = await signatureService.updateSignature(id, dataToUpdate);
    res.json(signature);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
};

exports.deleteSignature = async (req, res) => {
  try {
    const { id } = req.params;
    await signatureService.deleteSignature(id);
    res.json({ message: "ลบลายเซ็นเรียบร้อยแล้ว" });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
};

exports.getSignatureIsMine = async (req, res) => {
  try {
    const userId = req.user.id; // ต้องใช้ middleware auth เพื่อให้ req.user มีข้อมูล

    const signature = await signatureService.getSignatureIsMine(userId);
    res.json(signature);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
};
