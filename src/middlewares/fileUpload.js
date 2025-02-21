const multer = require('multer');
// const fileType = require('file-type');
const path = require('path');
const createError = require('../utils/createError');

// สร้าง folder จัดเก็บภาพ profile
const storageProfile = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, path.join(__dirname, '../../uploads/profile'));
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const fileExtension = path.extname(file.originalname);
        cb(null, `${file.fieldname}-${uniqueSuffix}${fileExtension}`);
    },
});

// สร้าง folder จัดเก็บภาพ evidence
const storageEvidence = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, path.join(__dirname, '../../uploads/evidence'));
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const fileExtension = path.extname(file.originalname);
        cb(null, `${file.fieldname}-${uniqueSuffix}${fileExtension}`);
    },
});

// ตรวจสอบประเภทของไฟล์
const fileFilter = async (req, file, cb) => {
    const allowedMimeTypes = ['image/jpeg', 'image/png', 'application/pdf'];

    const buffer = await fs.promise.readFile(file.path);
    const type = await fileType.fromBuffer(buffer);

    if (type && allowedMimeTypes.includes(file.mimetype)) {
        cb(null, true); //อนุญาตให้ upload
    } else {
        cb(createError(400, 'Invalid file type. Only JPEG, PNG, and PDF are allowed.'));
    }
};

//กำหนดขนาดของไฟล์ (5 MB)
exports.uploadProfile = multer({
    storageProfile,
    fileFilter,
    limits: { fileSize: 5 * 1024 * 1024 }, 
});

exports.uploadEvidence = multer({
    storageEvidence,
    fileFilter,
    limits: { fileSize: 5 * 1024 * 1024 },
});
