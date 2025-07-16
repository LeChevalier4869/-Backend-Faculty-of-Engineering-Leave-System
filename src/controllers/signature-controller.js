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
    const userId = req.params.userId;
    const file = req.file;

    const dataToUpdate = {};

    // ถ้ามีไฟล์แนบ ให้ upload แล้วใช้ URL
    if (file) {
      const imgUrl = await cloudUpload(file.path);
      dataToUpdate.file = imgUrl;
    }

    const signature = await signatureService.updateSignature(userId, dataToUpdate);
    res.json(signature);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
};

exports.deleteSignature = async (req, res) => {
  try {
    const userId = req.params.userId;
    await signatureService.deleteSignature(userId);
    res.json({ message: "ลบลายเซ็นเรียบร้อยแล้ว" });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
};

exports.getSignatureIsMine = async (req, res) => {
  try {
    const userId = req.user.id; // ต้องใช้ middleware auth เพื่อให้ req.user มีข้อมูล
    console.log("Getting signature for user ID:", userId);
    const signature = await signatureService.getSignatureIsMine(userId);
    res.json(signature);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
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
exports.getSignatureByUserId = async (req, res) => {
  try {
    const userId = req.params.userId; // รับ userId จากพารามิเตอร์ URL
    const signature = await signatureService.getSignatureByUserId(userId);
    res.json(signature);
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message });
  }
};