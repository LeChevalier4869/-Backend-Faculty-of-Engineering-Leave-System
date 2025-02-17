const AdminService = require('../services/admin-service');
const createError = require('../utils/createError');
const { sendEmail } = require('../utils/emailService');

exports.adminList = async (req, res, next) => {
    try {
        const list = await AdminService.adminList();

        if (!list) {
            throw createError(400, ``);
        }

        res.status(200).json({ message: "response ok", adminList: list });
    } catch (err) {
        next(err);
    }
};