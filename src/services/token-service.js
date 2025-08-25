const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const prisma = require('../config/prisma');

const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

function signAccessToken(payload) {
    return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

async function issueRefreshToken(userId, days = 30) {
    const raw = crypto.randomBytes(48).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(raw).digest('hex');

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + days);

    await prisma.refreshToken.create({
        data: {
            userId,
            tokenHash,
            expiresAt,
        },
    });

    return raw; // ส่งค่า plaintext ให้ client เก็บ
}

async function rotateRefreshToken(oldRaw) {
    const oldHash = crypto.createHash('sha256').update(oldRaw).digest('hex');

    const found = await prisma.refreshToken.findFirst({
        where: { tokenHash: oldHash, revoked: false, expiresAt: { gt: new Date() } },
    });
    if (!found) throw new Error('Invalid or expired refresh token');

    await prisma.refreshToken.update({
        where: { id: found.id },
        data: { revoked: true },
    });

    return issueRefreshToken(found.userId, 30);
}

async function revokeAllUserTokens(userId) {
    await prisma.refreshToken.updateMany({
        where: { userId, revoked: false },
        data: { revoked: true },
    });
}

module.exports = {
    signAccessToken,
    issueRefreshToken,
    rotateRefreshToken,
    revokeAllUserTokens,
};