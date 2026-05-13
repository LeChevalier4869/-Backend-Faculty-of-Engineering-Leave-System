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

module.exports = { cloudUpload, cloudDelete };