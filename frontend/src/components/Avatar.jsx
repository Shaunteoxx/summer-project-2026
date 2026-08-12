import { avatarSrc, monogramToken } from "@/lib/avatars";

/**
 * A user's avatar, with a fallback chain:
 * chosen animal → Google profile photo → monogram on a name-derived hue.
 *
 * The monogram is the interesting case. It used to be a grey initial, which
 * made every avatar-less user look identical on the Friends leaderboard — the
 * one screen whose whole job is telling people apart. The hue comes from the
 * username, so it's stable across sessions and devices without storing
 * anything, and it's drawn from the eight category tokens so it adds no new
 * colour to the system.
 *
 * Accepts any object with { avatar, profilePicture, username }.
 */
export default function Avatar({ user, className = "h-10 w-10" }) {
  const animal = avatarSrc(user?.avatar);
  const name = user?.username;

  if (animal) {
    return (
      <span
        className={`${className} flex items-center justify-center overflow-hidden rounded-full bg-surface-2`}
      >
        <img
          src={animal}
          alt={name ? `${name}'s avatar` : "avatar"}
          className="h-[68%] w-[68%]"
          draggable="false"
        />
      </span>
    );
  }

  if (user?.profilePicture) {
    return (
      <img
        src={user.profilePicture}
        alt={name ?? "avatar"}
        className={`${className} rounded-full border border-hairline object-cover`}
      />
    );
  }

  const token = monogramToken(name ?? "");
  return (
    <span
      className={`${className} flex items-center justify-center rounded-full font-semibold tracking-tight`}
      style={{
        // 16% tint of the hue behind, the full hue for the letter — the same
        // relationship every category tile in the app uses.
        background: `color-mix(in srgb, hsl(var(--cat-${token})) 16%, transparent)`,
        color: `hsl(var(--cat-${token}))`,
        fontSize: "0.44em",
      }}
      aria-hidden={!name}
    >
      {name?.[0]?.toUpperCase() ?? "?"}
    </span>
  );
}
