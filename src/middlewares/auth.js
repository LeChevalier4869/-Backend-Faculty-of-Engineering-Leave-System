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

const authorize = (requiredRoles) => (req, res, next) => {
    const userRoles = req.user.roles.map(role => role.name);
    const hasRequiredRole = requiredRoles.some(role => userRoles.includes(role));

    if (!hasRequiredRole) {
        return next(createError(403, 'Forbidden'));
    }

    next();
};

module.exports = { authenticate, authorize };