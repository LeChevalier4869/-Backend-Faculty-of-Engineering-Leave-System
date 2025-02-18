const passport = require('passport');
const prisma = require('../config/prisma');
const GoogleStrategy = require('passport-google-oauth20').Strategy;

passport.use(
    new GoogleStrategy(
        {
            clientID: process.env.GOOGLE_CLIENT_ID,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET,
            callbackURL: process.env.GOOGLE_CALLBACK_URL,
            passReqToCallback: true,
        },
        async (req, accessToken, refreshToken, profile, done) => {
            try {
                // check domain
                const email = profile.emails[0].value;
                if (!email.endsWith('@rmuti.ac.th')) {
                    return done(new Error('อนุญาตเฉพาะบัญชี @rmuti.ac.th'), null);
                }

                //check user is exist
                let user = await prisma.users.findUnique({
                    where: { email },
                });

                //if not -> new account (wait user create password)
                if (!user) {
                    user = await prisma.users.create({
                        data: {
                            email,
                            googleId: profile.id,
                            isGoogleAccount: true,
                            password: null, //wait for user create password
                        },
                    });
                }

                return done(null, user);
            } catch (err) {
                return done(err, null);
            }
        }
    )
);