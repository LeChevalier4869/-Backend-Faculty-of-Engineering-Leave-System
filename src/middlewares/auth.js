const createError = require('../utils/createError');
const jwt = require('jsonwebtoken');
const authenticate = (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1];
    if(!token) {
        return createError(401, 'Unauthorized');
    }
    try {
        const user = jwt.verify(token, process.env.JWT_SECRET);
        //console.log("Decoded User: ", user);
        req.user = user;
        next();
    } catch {
        createError(401, 'Unauthorized');
    }
};

const authorize = (requiredRoles) => (req, res, next) => {
    if (!req.user || !req.user.role) {
        return next(createError(403, 'Forbidden: no role assigned.'));
    }
    console.log("Decoded User Role: ", req.user.role);

    const userRoles = req.user.role ?? []; // protect undefined
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