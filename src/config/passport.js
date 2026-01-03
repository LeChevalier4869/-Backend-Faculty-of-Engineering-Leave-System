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
   
  //  console.log("NODE_ENV:", process.env.NODE_ENV);
  //  console.log("BACKEND_URL:", process.env.BACKEND_URL);
  //  console.log("Google OAuth Callback URL:", callbackURL);
   
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
           console.log("Frontend origin:", req?.headers?.origin);
           
           // ดึง profile จาก Google
           const googleId = profile.id;
           const email = profile.emails[0].value;
           // const firstName = profile.name.givenName;
           // const lastName = profile.name.familyName;

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
 }

module.exports = passport;
