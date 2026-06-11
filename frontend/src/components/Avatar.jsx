import { avatarSrc } from "@/lib/avatars";

/**
 * Renders a user's avatar with a consistent fallback chain:
 * chosen animal avatar → Google profile photo → first initial.
 * Accepts any object with { avatar, profilePicture, username }.
 */
export default function Avatar({ user, className = "h-10 w-10" }) {
  const animal = avatarSrc(user?.avatar);
  const name = user?.username;

  if (animal) {
    return (
      <span
        className={`${className} flex items-center justify-center overflow-hidden rounded-full bg-accent`}
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
        className={`${className} rounded-full border border-border object-cover`}
      />
    );
  }

  return (
    <span
      className={`${className} flex items-center justify-center rounded-full bg-accent text-sm font-bold text-accent-foreground`}
    >
      {name?.[0]?.toUpperCase() ?? "?"}
    </span>
  );
}
