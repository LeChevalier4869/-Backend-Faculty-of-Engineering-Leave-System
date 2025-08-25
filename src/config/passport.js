// const passport = require('passport');
// const prisma = require('../config/prisma');
// const GoogleStrategy = require('passport-google-oauth20').Strategy;

// passport.use(
//     new GoogleStrategy(
//         {
//             clientID: process.env.GOOGLE_CLIENT_ID,
//             clientSecret: process.env.GOOGLE_CLIENT_SECRET,
//             callbackURL: process.env.GOOGLE_CALLBACK_URL,
//             passReqToCallback: true,
//         },
//         async (req, accessToken, refreshToken, profile, done) => {
//             try {
//                 // check domain
//                 const email = profile.emails[0].value;
//                 if (!email.endsWith('@rmuti.ac.th')) {
//                     return done(new Error('อนุญาตเฉพาะบัญชี @rmuti.ac.th'), null);
//                 }

//                 //check user is exist
//                 let user = await prisma.users.findUnique({
//                     where: { email },
//                 });

//                 //if not -> new account (wait user create password)
//                 if (!user) {
//                     user = await prisma.users.create({
//                         data: {
//                             email,
//                             googleId: profile.id,
//                             isGoogleAccount: true,
//                             password: null, //wait for user create password
//                         },
//                     });
//                 }

//                 return done(null, user);
//             } catch (err) {
//                 return done(err, null);
//             }
//         }
//     )
// );

// const GoogleStrategy = require("passport-google-oauth20").Strategy;
// const passport = require("passport");
// const { PrismaClient } = require("@prisma/client");

// const prisma = new PrismaClient();

// passport.use(
//   new GoogleStrategy(
//     {
//       clientID: process.env.GOOGLE_CLIENT_ID,
//       clientSecret: process.env.GOOGLE_CLIENT_SECRET,
//       callbackURL: process.env.GOOGLE_CALLBACK_URL,
//     },
//     async (accessToken, refreshToken, profile, done) => {
//       const user = await prisma.user.upsert({
//         where: { email: profile.emails[0].value },
//         update: {},
//         create: {
//           email: profile.emails[0].value,
//           name: profile.displayName,
//           image: profile.photos[0].value,
//           provider: "google",
//         },
//       });
//       return done(null, user);
//     }
//   )
// );

// passport.serializeUser((user, done) => {
//   done(null, user.id);
// });

// passport.deserializeUser(async (id, done) => {
//   const user = await prisma.user.findUnique({ where: { id } });
//   done(null, user);
// });

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

