// const jwt = require("jsonwebtoken");

// const generateAccessToken = (user) => {
//   return jwt.sign({ id: user.id, email: user.email }, process.env.JWT_SECRET, {
//     expiresIn: "15m",
//   });
// };

// const generateRefreshToken = (user) => {
//   return jwt.sign({ id: user.id }, process.env.REFRESH_SECRET, {
//     expiresIn: "7d",
//   });
// };

// module.exports = { generateAccessToken, generateRefreshToken };

const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const prisma = require("../config/prisma");

const ACCESS_EXPIRES = "15m";
const REFRESH_EXPIRES = "7d";

async function generateTokens(userId) {
  const accessToken = jwt.sign({ userId }, process.env.JWT_ACCESS_SECRET, { expiresIn: ACCESS_EXPIRES });
  const refreshTokenRaw = jwt.sign({ userId }, process.env.JWT_REFRESH_SECRET, { expiresIn: REFRESH_EXPIRES });
  const tokenHash = await bcrypt.hash(refreshTokenRaw, 10);

  await prisma.refreshToken.create({
    data: {
      userId,
      tokenHash,
      expiresAt: new Date(Date.now() + 7*24*60*60*1000)
    }
  });

  return { accessToken, refreshToken: refreshTokenRaw };
}

async function refreshAccessToken(refreshToken) {
  try {
    const payload = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
    const dbToken = await prisma.refreshToken.findFirst({ where: { userId: payload.userId, revoked: false } });

    if (!dbToken) throw new Error("Invalid refresh token");

    const isValid = await bcrypt.compare(refreshToken, dbToken.tokenHash);
    if (!isValid) throw new Error("Invalid refresh token");

    const accessToken = jwt.sign({ userId: payload.userId }, process.env.JWT_ACCESS_SECRET, { expiresIn: ACCESS_EXPIRES });
    return accessToken;
  } catch (err) {
    throw new Error("Invalid refresh token");
  }
}

module.exports = { generateTokens, refreshAccessToken };
