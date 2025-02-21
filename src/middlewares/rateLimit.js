const rateLimit = require('express-rate-limit');

const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, //15 min
    max: 500, //5 times per ip
    message: 'Too many login attempts, please try again later.'
});

const registerLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, //60 min
    max: 3, //3 times per ip
    message: 'Too many register attempts, please try again later.'
});

const leaveRequestLimiter = rateLimit({
    windowMs: 5 * 60 * 1000, //5 min
    max: 10, //10 times per ip
    message: 'Too many request for leave request attempts, please try again later.'
});

const uploadLimiter = rateLimit({
    windowMs: 10 * 60 * 1000, //10 min
    max: 20, //20 times per ip
    message: 'Too many upload attempts, please try again later.'
});

module.exports = { loginLimiter, registerLimiter, leaveRequestLimiter, uploadLimiter };
