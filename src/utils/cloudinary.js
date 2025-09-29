// const cloudinary = require('../config/cloudinary');

// const cloudUpload = async (path) => {
//     const res = await cloudinary.uploader.upload(path);
//     return res.secure_url;
// };

// module.exports = cloudUpload;
const cloudinary = require("../config/cloudinary");

async function cloudUpload(path) {
  try {
    const res = await cloudinary.uploader.upload(path, {
      folder: "leave_templates",
      use_filename: true,
      unique_filename: false,
      overwrite: true,
      resource_type: path.endsWith(".pdf") ? "raw" : "auto", // PDF = raw
      type: "upload", // public
    });

    console.log(res); // ตรวจสอบ type / secure_url

    return res.secure_url;
  } catch (err) {
    console.error("Cloudinary upload error:", err);
    throw err;
  }
}

module.exports = cloudUpload;
