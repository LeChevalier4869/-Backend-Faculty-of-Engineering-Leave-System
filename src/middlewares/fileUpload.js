const multer = require('multer');
const path = require('path');
const fs = require('fs');
const createError = require('../utils/createError');

// สร้าง folder จัดเก็บภาพ profile ถ้ายังไม่มี
const profileDir = path.join(__dirname, '../../uploads/profile');
if (!fs.existsSync(profileDir)) {
    fs.mkdirSync(profileDir, { recursive: true });
}

// สร้าง folder จัดเก็บภาพ evidence ถ้ายังไม่มี
const evidenceDir = path.join(__dirname, '../../uploads/evidence');
if (!fs.existsSync(evidenceDir)) {
    fs.mkdirSync(evidenceDir, { recursive: true });
}

// สร้าง folder จัดเก็บภาพ profile
const storageProfile = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, profileDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const fileExtension = path.extname(file.originalname);
        cb(null, `profile-${uniqueSuffix}${fileExtension}`);
    },
});

// สร้าง folder จัดเก็บภาพ evidence
const storageEvidence = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, evidenceDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const fileExtension = path.extname(file.originalname);
        cb(null, `evidence-${uniqueSuffix}${fileExtension}`);
    },
});

// ตรวจสอบประเภทของไฟล์สำหรับ profile picture (เฉพาะรูปภาพ)
const profileFileFilter = (req, file, cb) => {
    const allowedMimeTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    
    if (allowedMimeTypes.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(createError(400, 'Invalid file type. Only JPEG, PNG, and WebP images are allowed for profile pictures.'));
    }
};

// ตรวจสอบประเภทของไฟล์สำหรับ evidence (รูปภาพและ PDF)
const evidenceFileFilter = (req, file, cb) => {
    const allowedMimeTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'application/pdf'];
    
    if (allowedMimeTypes.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(createError(400, 'Invalid file type. Only JPEG, PNG, WebP images and PDF are allowed for evidence.'));
    }
};

//กำหนดขนาดของไฟล์ profile picture (2 MB - มาตรฐานสำหรับรูปโปรไฟล์)
exports.uploadProfile = multer({
    storage: storageProfile,
    fileFilter: profileFileFilter,
    limits: { fileSize: 2 * 1024 * 1024 }, 
});

//กำหนดขนาดของไฟล์ evidence (5 MB)
exports.uploadEvidence = multer({
    storage: storageEvidence,
    fileFilter: evidenceFileFilter,
    limits: { fileSize: 5 * 1024 * 1024 },
});
