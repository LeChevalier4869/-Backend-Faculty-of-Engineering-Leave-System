const multer = require('multer');
const path = require('path');
const createError = require('../utils/createError');

// สร้าง folder จัดเก็บไฟล์
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, path.join(__dirname, '../../uploads'));
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const fileExtension = path.extname(file.originalname);
        cb(null, `${file.fieldname}-${uniqueSuffix}${fileExtension}`);
    },
});

// ตรวจสอบประเภทของไฟล์
const fileFilter = (req, file, cb) => {
    const allowedMimeTypes = ['image/jpeg', 'image/png', 'application/pdf'];
    if (allowedMimeTypes.includes(file.mimetype)) {
        cb(null, true); //อนุญาตให้ upload
    } else {
        cb(createError(400, 'Invalid file type. Only JPEG, PNG, and PDF are allowed.'));
    }
};

//กำหนดขนาดของไฟล์ (5 MB)
const upload = multer({
    storage,
    fileFilter,
    limits: { fileSize: 5 * 1024 * 1024 }, 
});

module.exports = upload;