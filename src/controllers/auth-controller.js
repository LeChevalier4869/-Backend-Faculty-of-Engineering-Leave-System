const UserService = require('../services/user-service');
const createError = require('../utils/createError');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// exports.register = async (req, res) => {
//     const { 
//         firstName, 
//         lastName, 
//         email, 
//         password, 
//         role, 
//         position, 
//         hireYear
//     } = req.body;
//     const passwordHash = await bcrypt.hash(password, 10);
//     await UserService.createUser({
//         firstName,
//         lastName,
//         email,
//         password: passwordHash,
//         role,
//         position,
//         hireYear
//     });
//     res.status(201).json({ message: 'User registered successfully' });
// };

exports.login = async (req, res, next) => {
    try {
        const { email, password } = req.body;

        const user = await UserService.getUserByEmail(email);
        if(!user) {
            return createError(404, 'User not found');
        }
    
        // จำเป็นต้องนำเข้าฐานข้อมูลก่อน แล้วรหัสจะทำยังไง?
        // const isMatch = await bcrypt.compare(password, user.password);
        // if(!isMatch) {
        //     return createError(401, 'Invalid email or password');
        // }
    
        if (user.password !== password) {
            return createError(401, 'Invalid email or password');
        }
    
        const token = jwt.sign(
            { id: user.id, role: user.role, email: user.email }, 
            process.env.JWT_SECRET, 
            { expiresIn: process.env.JWT_EXPIRESIN });
        res.status(200).json({ token });
    } catch (err) {
        next(err);
    }
};

exports.getMe = async (req, res, next) => {
    res.json(req.user);
};

exports.updateProfile = async (req, res) => {
    try {
        const userId = req.user.id;
        const { profilePicturePath } = req.body;

        const updatedUser = await UserService.updateUser(userId, {
            profilePicturePath,
        });

        res.status(200).json({
            message: 'Profile picture updated',
            user: updatedUser,

        });
    } catch (err) {
        console.log(error);
        next(err);
    }
};