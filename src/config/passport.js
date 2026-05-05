const passport = require("passport");
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const AuthService = require("../services/auth-service");

 const isTestEnv =
   process.env.NODE_ENV === "test" ||
   process.env.JEST_WORKER_ID !== undefined;

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
 if (!isTestEnv && process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
   // Use localhost as default for development, production URL will be set via BACKEND_URL
   const callbackURL = process.env.NODE_ENV === 'production' 
     ? `${process.env.BACKEND_URL}/auth/google/callback`
     : 'http://localhost:8000/auth/google/callback';
   
   
   passport.use(
     new GoogleStrategy(
       {
         clientID: process.env.GOOGLE_CLIENT_ID,
         clientSecret: process.env.GOOGLE_CLIENT_SECRET,
         callbackURL: callbackURL,
         passReqToCallback: true,
       },
       async (req, accessToken, refreshToken, profile, done) => {
        try {
          const googleId = profile.id;
          const email = profile.emails[0].value;
          const profilePicture = profile.photos && profile.photos[0] ? profile.photos[0].value : null;
          
          const { user, accessToken: jwtAccess, refreshToken: jwtRefresh } =
            await AuthService.loginWithOAuth("google", googleId, email, profilePicture);

          return done(null, { ...user, jwtAccess, jwtRefresh });
        } catch (err) {
          return done(err, null, { error: err.message });
        }
      }
     )
   );
 }

module.exports = passport;
