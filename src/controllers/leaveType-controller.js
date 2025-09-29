const LeaveTypeService = require("../services/leaveType-service");
const createError = require("../utils/createError");
const cloudUpload = require("../utils/cloudUpload");

exports.createLeaveType = async (req, res, next) => {
  try {
    const name = req.body;
    if (!name) throw createError(400, "กรุณาระบุชื่อประเภทการลา");

    console.log("🔍 สร้างประเภทการลา:", { name });
    const leaveType = await LeaveTypeService.createLeaveType(name);
    res
      .status(201)
      .json({ message: "สร้างประเภทการลาเรียบร้อยแล้ว", data: leaveType });
  } catch (err) {
    next(err);
  }
};

exports.updateLeaveType = async (req, res, next) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    const numID = Number(id);
    const file = req.file;

    if (isNaN(numID) || numID <= 0) {
      throw createError(400, "รหัสประเภทการลาไม่ถูกต้อง");
    }

    const dataToUpdate = {};

    // ถ้ามีไฟล์แนบ → upload แล้วเก็บเป็น URL

    if (file) {
      // อัปโหลดไฟล์ PDF เป็น public → คืน URL เปิดตรง ๆ
      const pdfUrl = await cloudUpload(file.path);
      console.log("Uploaded PDF URL:", pdfUrl); // เปิด URL นี้ใน browser

      dataToUpdate.template = pdfUrl;
    }

    const leaveType = await LeaveTypeService.updateLeaveType(
      numID,
      updates,
      dataToUpdate
    );

    res.status(200).json({
      message: "อัปเดตประเภทการลาแล้ว",
      data: leaveType,
    });
  } catch (err) {
    next(err);
  }
};

// exports.updateLeaveType = async (req, res, next) => {
//   try {
//     const { id } = req.params;
//     const updates = req.body;
//     const numID = Number(id);

//     if (!numID || isNaN(id)) {
//       throw createError(400, "รหัสประเภทการลาไม่ถูกต้อง");
//     }

//     const leaveType = await LeaveTypeService.updateLeaveType(numID, updates);
//     res
//       .status(200)
//       .json({ message: "อัปเดตประเภทการลาแล้ว", data: leaveType });
//   } catch (err) {
//     next(err);
//   }
// };

exports.deleteLeaveType = async (req, res, next) => {
  try {
    const { id } = req.params;
    const numID = Number(id);

    if (!numID || isNaN(id)) {
      throw createError(400, "รหัสประเภทการลาไม่ถูกต้อง");
    }

    const deleted = await LeaveTypeService.deleteLeaveType(numID);
    if (!deleted) throw createError(404, "ไม่พบประเภทการลาที่ต้องการลบ");

    res.status(200).json({ message: "ลบประเภทการลาเรียบร้อยแล้ว" });
  } catch (err) {
    next(err);
  }
};

exports.getAllLeaveType = async (req, res, next) => {
  try {
    const leaveType = await LeaveTypeService.getAllLeaveType();
    res
      .status(200)
      .json({ message: "ดึงข้อมูลประเภทการลาทั้งหมดแล้ว", data: leaveType });
  } catch (err) {
    next(err);
  }
};

exports.getLeaveTypeById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const numID = Number(id);

    if (!numID || isNaN(id)) {
      throw createError(400, "รหัสประเภทการลาไม่ถูกต้อง");
    }

    const leaveType = await LeaveTypeService.getLeaveTypeById(numID);

    if (!leaveType) {
      throw createError(404, "ไม่พบประเภทการลาที่ต้องการ");
    }

    res
      .status(200)
      .json({ message: "ดึงข้อมูลประเภทการลาเรียบร้อยแล้ว", data: leaveType });
  } catch (err) {
    next(err);
  }
};

exports.getAvailableLeaveTypes = async (req, res) => {
  try {
    const leaveTypes = await LeaveTypeService.getAvailableLeaveTypes();
    res.status(200).json({
      success: true,
      data: leaveTypes,
    });
  } catch (error) {
    console.error("Error in getAvailableLeaveTypes controller:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};
