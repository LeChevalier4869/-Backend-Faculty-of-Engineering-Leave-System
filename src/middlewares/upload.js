// const multer = require('multer');
// const path = require('path');

// const storage = multer.diskStorage({
//     destination: function (req, file, cb) {
//         cb(null, path.join(__dirname, '../../uploads'));
//     },
//     filename: function (req, file, cb) {
//         const ext = file.originalname.split('.').pop();
//         cb(null, `${Date.now()}-${file.originalname}`);
//     },
// });

// const uploadProfile = multer({ 
//     storage: storage,
//     limits: { fileSize: 2 * 1024 * 1024 },
//     fileFilter: (req, file, cb) => {
//         const filetypes = /jpeg|jpg|png/;
//         const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
//         const mimetype = filetypes.test(file.mimetype);
//         if (extname && mimetype) {
//             return cb(null, true);
//         }
//         cb('Error: Images Only!');
//     }
// }).single('profilePicturePath');

// module.exports = { uploadProfile };

// middlewares/upload.js
const multer  = require("multer");
const path    = require("path");
const fs      = require("fs");

// เตรียมโฟลเดอร์ tmp เก็บไฟล์ชั่วคราว
const tmpDir = path.join(__dirname, "..", "tmp");
if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir);

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, tmpDir),
  filename:    (req, file, cb) => cb(null, Date.now() + "-" + file.originalname),
});

module.exports = multer({ storage });

