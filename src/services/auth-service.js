const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const prisma = require("../config/prisma");

const ACCESS_SECRET = process.env.ACCESS_SECRET;
const REFRESH_SECRET = process.env.REFRESH_SECRET;

async function generateTokens(userId) {
  const accessToken = jwt.sign({ userId }, ACCESS_SECRET, { expiresIn: "15m" });
  const refreshToken = jwt.sign({ userId }, REFRESH_SECRET, { expiresIn: "7d" });

  // เก็บ hash ของ refresh token
  const hash = await bcrypt.hash(refreshToken, 10);

  await prisma.refreshToken.create({
    data: {
      userId,
      tokenHash: hash,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    },
  });

  return { accessToken, refreshToken };
}

async function loginWithOAuth(provider, providerAccountId, profile) {
  let account = await prisma.account.findUnique({
    where: {
      provider_providerAccountId: { provider, providerAccountId },
    },
    include: { user: true },
  });

  if (!account) {
    // สร้าง user ใหม่
    const user = await prisma.user.create({
      data: {
        firstName: profile.firstName,
        lastName: profile.lastName,
        email: profile.email,
        sex: profile.sex || "N/A",
        hireDate: new Date(),
        departmentId: 1, // ค่า default หรือหา logic ใส่
        personnelTypeId: 1,
        accounts: {
          create: {
            provider,
            providerAccountId,
          },
        },
      },
    });
    account = { user };
  }

  const tokens = await generateTokens(account.user.id);
  return { user: account.user, ...tokens };
}

async function refreshToken(oldToken) {
  try {
    const payload = jwt.verify(oldToken, REFRESH_SECRET);
    const userId = payload.userId;

    const tokens = await prisma.refreshToken.findMany({
      where: { userId, revoked: false },
    });

    let valid = false;
    for (const t of tokens) {
      if (await bcrypt.compare(oldToken, t.tokenHash)) {
        valid = true;
        break;
      }
    }

    if (!valid) throw new Error("Invalid refresh token");

    return generateTokens(userId);
  } catch (err) {
    throw new Error("Refresh failed");
  }
}

async function logout(userId) {
  await prisma.refreshToken.updateMany({
    where: { userId, revoked: false },
    data: { revoked: true },
  });
}

module.exports = { loginWithOAuth, refreshToken, logout };
