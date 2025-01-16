const UserService = require('../services/user-service');
const createError = require('../utils/createError');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cloudUpload = require('../utils/cloudinary');

exports.register = async (req, res, next) => {
    try {
        const { 
            prefixName,
            firstName, 
            lastName, 
            email, 
            password, 
            role, 
            position, 
            faculty,
            hireYear,
            levelId,
            personnelTypeId,
            departmentId
        } = req.body;

        //ตรวจสอบ
        console.log(req.body);
        
        if (!email || !password) {
            throw createError(400, "กรุณากรอกอีเมลและรหัสผ่าน");
        }

        // ตรวจสอบเงื่อนไข รหัสต้องมีความยาวมากกว่า 8 ตัว, ต้องมีตัวอักษรยอย่างน้อย 5 ตัว
        const letterCount = (password.match(/[a-zA-Z]/g) || []).length;
        if (String(password).length < 8 || letterCount < 5) {
            throw createError(400, "รหัสผ่านต้องมีความยาวมากกว่า 8 ตัวอักษร และต้องมีตัวอักษรอย่างน้อย 5 ตัว");
        }

        const userExist = await UserService.getUserByEmail(email);
        if (userExist) {
            throw createError(400, "มีบัญชีที่ใช้อีเมลนี้แล้ว");
        }
        console.log(userExist)

        const passwordHash = await bcrypt.hash(password, 10);

        let profilePicturePath = null;
        if (req.file) {
            profilePicturePath = await cloudUpload(req.file.path);
        }

        await UserService.createUser({
            prefixName,
            firstName,
            lastName,
            email,
            password: passwordHash,
            role,
            position,
            faculty,
            hireYear,
            levelId,
            personnelTypeId,
            departmentId,
            profilePicturePath
        });
        res.status(201).json({ message: 'User registered successfully' });
    } catch (err) {
        // จัดการข้อผิดพลาด
        if (err.code === 11000) { // รหัสข้อผิดพลาด MongoDB ซ้ำ
            next(createError(400, "อีเมลนี้มีอยู่ในระบบแล้ว"));
        } else {
            next(err);
        }
    }
};

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
            { 
                id: user.id,
                role: user.role, 
                email: user.email,
                prefixName: user.prefixName,
                firstName: user.firstName,
                lastName: user.lastName,
                department: user.department.name,
                position: user.position,
                personnelType: user.personnelType.name,
                faculty: user.faculty,
                hireYear: user.hireYear,
            }, 
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

exports.userLanding = async (req, res) => {
    try {
        const user = await UserService.getUserLanding();
        res.status(200).json({ user });
    } catch (err) {
        res.status(500).json({ error: 'Error from controller user landing' });
    }
};

exports.updateProfile = async (req, res, next) => {
    try {
        const userEmail = req.user.email;
        const { profilePicturePath } = req.body;

        let updateProfilePicturePath = null;
        if (req.file) {
            updateProfilePicturePath = await cloudUpload(req.file.path);
        }

        const updatedUser = await UserService.updateUser(userEmail, {
            profilePicturePath: updateProfilePicturePath || profilePicturePath,
        });

        res.status(200).json({
            message: 'Profile picture updated',
            user: updatedUser,

        });
    } catch (err) {
        next(err);
    }
};