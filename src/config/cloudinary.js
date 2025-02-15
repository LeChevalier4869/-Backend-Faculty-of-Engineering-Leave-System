const cloudinary = require('cloudinary').v2;

if (!process.env.CLOUDINARY_SECRET) {
    throw new Error("CLOUDINARY_SECRET environment variable is missing!");
}

cloudinary.config({
    cloud_name: 'dasrmjl0f',
    api_key: '316341844843451',
    api_secret: process.env.CLOUDINARY_SECRET,
});

module.exports = cloudinary;