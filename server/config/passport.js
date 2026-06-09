import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import User from "../models/User.js";

export function configurePassport() {
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    console.warn(
      "⚠️  GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET are not set.\n" +
        "    Copy .env.example to server/.env and add your Google OAuth credentials.\n" +
        "    Google sign-in is disabled until they are provided."
    );
    return;
  }

  passport.use(
    new GoogleStrategy(
      {
        clientID: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        callbackURL:
          process.env.GOOGLE_CALLBACK_URL ||
          "http://localhost:5000/api/auth/google/callback",
      },
      async (accessToken, refreshToken, profile, done) => {
        try {
          let user = await User.findOne({ googleId: profile.id });

          if (!user) {
            // Build a unique username from the Google display name / email.
            const base =
              (profile.displayName || profile.emails?.[0]?.value || "user")
                .toLowerCase()
                .replace(/[^a-z0-9]/g, "")
                .slice(0, 20) || "user";

            let username = base;
            let suffix = 0;
            while (await User.findOne({ username })) {
              suffix += 1;
              username = `${base}${suffix}`;
            }

            user = await User.create({
              googleId: profile.id,
              username,
              email: profile.emails?.[0]?.value || `${profile.id}@noemail.local`,
              profilePicture: profile.photos?.[0]?.value || "",
            });
          }

          return done(null, user);
        } catch (err) {
          return done(err, null);
        }
      }
    )
  );
}
