const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const prisma = require("../config/prisma");

const ACCESS_SECRET = process.env.JWT_ACCESS_SECRET;
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET;

async function generateTokens(userId) {
  const accessToken = jwt.sign({ userId }, ACCESS_SECRET, { expiresIn: "8h" });
  const refreshToken = jwt.sign({ userId }, REFRESH_SECRET, {
    expiresIn: "7d",
  });

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

async function loginWithOAuth(provider, providerAccountId, email, profilePictureUrl = null) {
  let account = await prisma.account.findUnique({
    where: {
      provider_providerAccountId: { provider, providerAccountId },
    },
    include: { user: true },
  });

  const userExist = await prisma.user.findFirst({
    where: { email },
  });

  if (userExist) {
    if (!account) {
      account = await prisma.account.create({
        data: {
          provider,
          providerAccountId,
          userId: userExist.id,
        },
        include: { user: true },
      });
    }
    
    // Save Google profile picture in Account table for default display
    if (profilePictureUrl) {
      await prisma.account.update({
        where: { 
          provider_providerAccountId: { provider, providerAccountId }
        },
        data: { profilePictureUrl: profilePictureUrl }
      });
      
      // Also set as main profile picture if user doesn't have one
      if (!userExist.profilePicturePath) {
        await prisma.user.update({
          where: { id: userExist.id },
          data: { profilePicturePath: profilePictureUrl }
        });
        userExist.profilePicturePath = profilePictureUrl;
      }
    }
    
    account = { user: userExist };
  } else {
    throw new Error("ไม่พบข้อมูลบัญชีของคุณในระบบ โปรดติดต่อเจ้าหน้าที่");
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

module.exports = { loginWithOAuth, refreshToken, logout, generateTokens };
