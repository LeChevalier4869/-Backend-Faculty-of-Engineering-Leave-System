const createError = require('../utils/createError');
const jwt = require('jsonwebtoken');
const authenticate = (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1];
    if(!token) {
        return createError(401, 'Unauthorized');
    }
    try {
        const user = jwt.verify(token, process.env.JWT_SECRET);
        req.user = user;
        next();
    } catch {
        createError(401, 'Unauthorized');
    }
};

module.exports = { authenticate };