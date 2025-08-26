const passport = require("passport");
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const AuthService = require("../services/auth-service");

// Serialize / Deserialize user
passport.serializeUser((user, done) => {
  done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
  try {
    // โหลด user จาก prisma
    const prisma = require("../config/prisma");
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
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: "https://backend-faculty-of-engineering-leave.onrender.com/auth/google/callback",
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        // ดึง profile จาก Google
        const googleId = profile.id;
        const email = profile.emails[0].value;
        const firstName = profile.name.givenName;
        const lastName = profile.name.familyName;

        const { user, accessToken: jwtAccess, refreshToken: jwtRefresh } =
          await AuthService.loginWithOAuth("google", googleId, {
            email,
            firstName,
            lastName,
            sex: profile.gender || "N/A",
          });

        // return ทั้ง user + token กลับไป
        return done(null, { ...user, jwtAccess, jwtRefresh });
      } catch (err) {
        done(err, null);
      }
    }
  )
);

module.exports = passport;
