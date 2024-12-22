const UserService = require('../services/user-service');
const createError = require('../utils/createError');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

exports.register = async (req, res) => {
    const { 
        firstName, 
        lastName, 
        email, 
        password, 
        role, 
        position, 
        hireYear
    } = req.body;
    const passwordHash = await bcrypt.hash(password, 10);
    await UserService.createUser({
        firstName,
        lastName,
        email,
        password: passwordHash,
        role,
        position,
        hireYear
    });
    res.status(201).json({ message: 'User registered successfully' });
};

exports.login = async (req, res) => {
    const { email, password } = req.body;

    const user = await UserService.getUserByEmail(email);
    if(!user) {
        return createError(404, 'User not found');
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if(!isMatch) {
        return createError(401, 'Invalid');
    }

    const token = jwt.sign(
        { id: user.id, role: user.role }, 
        process.env.JWT_SECRET, 
        { expiresIn: process.env.JWT_EXPIRESIN });
    res.status(200).json({ token });
};