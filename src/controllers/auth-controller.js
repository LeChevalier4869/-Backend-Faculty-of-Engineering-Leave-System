const UserService = require('../services/user-service');
const createError = require('../utils/createError');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cloudUpload = require('../utils/cloudinary');
const multer = require('multer');
const upload = multer();

exports.register = async (req, res, next) => {
    try {
        const { 
            prefixName,
            firstName, 
            lastName,
            username, 
            email, 
            password, 
            phone,
            roleNames = ['USER'], 
            position, 
            hireDate,
            levelId,
            personnelTypeId,
            organizationId,
            departmentId,
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

        const newUser = await UserService.createUser({
            prefixName,
            firstName,
            lastName,
            username,
            email,
            password: passwordHash,
            phone,
            position,
            hireDate,
            levelId: Number(levelId),
            personnelTypeId: Number(personnelTypeId),
            organizationId: Number(organizationId),
            departmentId: Number(departmentId),
            profilePicturePath
        });

        const roles = await UserService.getRolesByNames(roleNames);
        if (!roles || roles.length !== roleNames.length) {
            throw createError(400, 'Invalid roles provided');
        }
        await UserService.assignRolesToUser(newUser.id, roles.map(role => role.id));

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
        const isMatch = await bcrypt.compare(password, user.password);
        if(!isMatch) {
            return createError(401, 'Invalid email or password');
        }
        // console.log('isMatch = ' + isMatch);
        // console.log('password = ' + password);
        // console.log('user pass = ' + user.password);

        const userWithRoles = await UserService.getUserByIdWithRoles(user.id);
        const roles = userWithRoles.User_Role.map(userRole => userRole.role.name);
    
        const token = jwt.sign(
            { 
                id: user.id,
                email: user.email,
                prefixName: user.prefixName,
                firstName: user.firstName,
                lastName: user.lastName,
                username: user.username,
                role: roles,
                phone: user.phone,
                organization: user.organization.name,
                department: user.department.name,
                position: user.position,
                personnelType: user.personnelType.name,
                hireDate: user.hireDate,
            }, 
            process.env.JWT_SECRET, 
            { expiresIn: process.env.JWT_EXPIRESIN });
        res.status(200).json({ token });
    } catch (err) {
        next(err);
    }
};

exports.getMe = async (req, res, next) => {
    try {
        res.status(200).json(req.user);
    } catch (err) {
        next(err);
    }
};

exports.userLanding = async (req, res) => {
    try {
        const user = await UserService.getUserLanding();

        if (!user || user.length === 0) {
            return createError(400, 'User not found');
        }

        //console.log("user = ", user);

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

exports.updateUserRole = async (req, res, next) => {
    const userId = parseInt(req.params.id);
    const { roleNames } = req.body;
    
    try {
        if (!userId || isNaN(userId)) {
            return createError(400, 'Invalid user ID');
        }
        if (!roleNames) {
            return createError(400, 'Role names are required');
        }
        
        const rolesArray = Array.isArray(roleNames) ? roleNames : [roleNames];
        const userRole = rolesArray.map(role => role.toUpperCase());
        const roles = await UserService.getRolesByNames(userRole);

    //    console.log('roles array = ' + rolesArray); 
    //    console.log('user role = ' + userRole); 
    //    console.log('roles = ' + roles); 

        if (!roles || roles.length !== userRole.length) {
            throw createError(400, 'Invalid roles provided');
        }

        const updatedRole = await UserService.updateUserRole(userId, roles.map(role => role.id));

        res.status(200).json({ message: 'User role updated', roles: updatedRole });
    } catch (err) {
        next(err);
    }
};

exports.updateUser = async (req, res, next) => {
    try {
        const userId = parseInt(req.params.id);
        // * admin can update only
        const { 
            prefixName,
            firstName, 
            lastName,
            username, 
            email, // *
            phone,
            position, // *
            hireDate, // *
            levelId, // *
            personnelTypeId, // *
            organizationId, // *
            departmentId, // *
        } = req.body;

        if (!userId || isNaN(userId)) {
            return createError(400, 'Invalid user ID');
        }

        const user = req.user;
        //console.log('role = ' + user.role);

        const userRole = String(user.role);

        let updateData = {};

        if (userRole === 'ADMIN') {
            updateData = {
                prefixName,
                firstName,
                lastName,
                username,
                email,
                phone,
                position,
                hireDate: new Date(hireDate),
                levelId,
                personnelTypeId,
                organizationId,
                departmentId,
            };
        } else if (userRole === 'USER') {
            updateData = {
                prefixName,
                firstName,
                lastName,
                username,
                phone,
            };
        } else {
            return createError(403, 'Permission denied');
        }
        
        if (!username || !email || !position || !hireDate || !levelId || !personnelTypeId || !organizationId || !departmentId) {
            return createError(400, 'Required fields are missing');
        }

       const updateUser = await UserService.updateUserById(userId, updateData);

       res.status(200).json({ message: 'User updated', user: updateUser });     
    } catch (err) {
        next(err);
    }
};

exports.updateUserStatus = async (req, res, next) => {
    try {
        const userId = parseInt(req.params.id);
        const { inActive } = req.body;
        // const inActived = Boolean(inActive);

        if (!userId || isNaN(userId)) {
            return createError(400, 'Invalid user ID');
        }

        // console.log('in active = ' + inActive);
        // console.log('in actived = ' + inActived);

        const inActived = inActive === 'true' || inActive === true;

        if (typeof inActived !== 'boolean') {   
            return createError(400, 'Invalid inActive');
        }

        const updateUserStatus = await UserService.updateUserStatusById(userId, inActived);

        res.status(200).json({ message: 'User status updated', user: updateUserStatus });
    } catch (err) {
        next(err);
    }
};