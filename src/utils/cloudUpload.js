const cloudinary = require('../config/cloudinary');

const cloudUpload = async (path) => {
    const res = await cloudinary.uploader.upload(path);
    return res.secure_url;
};

const cloudDelete = async (publicId) => {
    try {
        const res = await cloudinary.uploader.destroy(publicId);
        return res;
    } catch (error) {
        console.error('Cloudinary delete error:', error);
        throw error;
    }
};

// export ตัว cloudUpload เป็น function หลัก (ทุก controller เรียก cloudUpload(path) ตรง ๆ)
// แนบ cloudDelete / cloudUpload เป็น property เผื่อเรียกแบบ destructure ในอนาคต
module.exports = cloudUpload;
module.exports.cloudUpload = cloudUpload;
module.exports.cloudDelete = cloudDelete;