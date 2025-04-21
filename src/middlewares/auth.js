const createError = require('../utils/createError');
const jwt = require('jsonwebtoken');
const authenticate = (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
        return next(createError(401, 'Unauthorized'));
    }
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        //console.log("Decoded User: ", user);

        // check token expiration

        const now = Math.floor(Date.now() / 1000); // หน่วยเป็นวินาที
        if (decoded.exp && decoded.exp < now) {
            return next(createError(401, 'Token expired'));
        }

        req.user = decoded;
        next();
    } catch (err) {
        console.error("JWT decode error:", err.message); // เพิ่ม log
        next(createError(401, 'Unauthorized'));
    }
    
};

const authorize = (requiredRoles) => (req, res, next) => {
    if (!req.user || !req.user.role) {
        return next(createError(403, 'Forbidden: no role assigned.'));
    }
    console.log("Decoded User Role: ", req.user.role);

    const userRoles = Array.isArray(req.user.role) ? req.user.role : [req.user.role];
    //const roleNames = Array.isArray(userRoles) ? userRoles.map(role => role.name) : [];
    const hasRequiredRole = requiredRoles.some(role => userRoles.includes(role));
    console.log("Decoded userRole: ", userRoles);
    //console.log("Decoded roleNames: ", roleNames);
    console.log("Decoded hasRequire Role: ", hasRequiredRole);
    if (!hasRequiredRole) {
        return next(createError(403, 'Forbidden'));
    }

    next();
};

module.exports = { authenticate, authorize };