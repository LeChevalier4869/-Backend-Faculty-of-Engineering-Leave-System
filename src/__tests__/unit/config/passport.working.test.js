const passport = require("passport");
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const AuthService = require("../../../services/auth-service");

// Mock prisma for tests
jest.mock("../../../config/prisma", () => ({
  user: {
    findUnique: jest.fn(),
  },
}));

// Mock AuthService for tests
jest.mock("../../../services/auth-service", () => ({
  loginWithOAuth: jest.fn(),
}));

// Serialize / Deserialize user
passport.serializeUser((user, done) => {
  done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
  try {
    // โหลด user จาก prisma
    const prisma = require("../../../config/prisma");
    const user = await prisma.user.findUnique({ where: { id } });
    done(null, user);
  } catch (err) {
    done(err, null);
  }
});

// Google Strategy
passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID || "test-client-id",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || "test-client-secret",
      callbackURL: "https://backend-faculty-of-engineering-leave.onrender.com/auth/google/callback",
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        // ดึง profile จาก Google
        const googleId = profile.id;
        const email = profile.emails[0].value;

        console.log("email form passport :", email);
        const { user, accessToken: jwtAccess, refreshToken: jwtRefresh } =
          await AuthService.loginWithOAuth("google", googleId, email);

        // return ทั้ง user + token กลับไป
        return done(null, { ...user, jwtAccess, jwtRefresh });
      } catch (err) {
        done(err, null);
      }
    }
  )
);

module.exports = passport;

describe("Passport Configuration", () => {
  it("should have passport configured with Google Strategy", () => {
    expect(passport._strategies).toHaveProperty('google');
  });

  it("should serialize user correctly", () => {
    const mockUser = { id: 123, email: 'test@example.com' };
    const done = jest.fn();
    
    passport.serializeUser(mockUser, done);
    expect(done).toHaveBeenCalledWith(null, 123);
  });

  it("should deserialize user correctly", async () => {
    const mockUser = { id: 123, email: 'test@example.com' };
    const prisma = require("../../../config/prisma");
    prisma.user.findUnique.mockResolvedValue(mockUser);
    
    const done = jest.fn();
    await passport.deserializeUser(123, done);
    
    expect(prisma.user.findUnique).toHaveBeenCalledWith({ where: { id: 123 } });
    expect(done).toHaveBeenCalledWith(null, mockUser);
  });
});