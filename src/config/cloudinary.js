const cloudinary = require('cloudinary').v2;

cloudinary.config({
    cloud_name: 'dasrmjl0f',
    api_key: '316341844843451',
    api_secret: process.env.CLOUDINARY_SECRET,
});

module.exports = cloudinary;