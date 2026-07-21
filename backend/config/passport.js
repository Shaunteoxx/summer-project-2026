import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import { env } from "./env.js";
import User from "../models/User.js";

export function configurePassport() {
  if (!env.googleClientId || !env.googleClientSecret) {
    console.warn("Google sign-in is disabled because OAuth credentials are not configured.");
    return;
  }

  passport.use(
    new GoogleStrategy(
      {
        clientID: env.googleClientId,
        clientSecret: env.googleClientSecret,
        callbackURL: env.googleCallbackUrl,
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
            while (
              await User.findOne({
                $or: [
                  { usernameKey: username.toLowerCase() },
                  { username: { $regex: `^${username}$`, $options: "i" } },
                ],
              })
            ) {
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
