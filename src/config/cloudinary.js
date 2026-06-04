const cloudinary = require('cloudinary').v2;

const isTestEnv =
  process.env.NODE_ENV === "test" ||
  process.env.JEST_WORKER_ID !== undefined;

if (!process.env.CLOUDINARY_SECRET) {
  if (isTestEnv) {
    process.env.CLOUDINARY_SECRET = "test";
  } else {
    throw new Error("CLOUDINARY_SECRET environment variable is missing!");
  }
}

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME || 'dasrmjl0f',
  api_key: process.env.CLOUDINARY_API_KEY || '316341844843451',
  api_secret: process.env.CLOUDINARY_SECRET,
});

module.exports = cloudinary;