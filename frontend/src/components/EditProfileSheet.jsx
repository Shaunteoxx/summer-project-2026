import { useEffect, useState } from "react";
import { motion, useAnimationControls } from "framer-motion";
import { Check } from "lucide-react";

import Avatar from "@/components/Avatar";
import BottomSheet from "@/components/BottomSheet";
import FieldError from "@/components/FieldError";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/useToast";
import { AVATARS, avatarSrc } from "@/lib/avatars";
import { updateProfile } from "@/api/endpoints";
import { SHAKE } from "@/animations/variants";

/** The More page's Edit Profile sheet: an avatar and a display name. */
export default function EditProfileSheet({ open, onClose }) {
  const { user, refresh } = useAuth();
  const toast = useToast();
  const [name, setName] = useState("");
  const [avatar, setAvatar] = useState("");
  const [saving, setSaving] = useState(false);
  const [nameError, setNameError] = useState("");
  const nameShake = useAnimationControls();

  useEffect(() => {
    if (!open) return;
    setName(user?.username ?? "");
    setAvatar(user?.avatar ?? "");
    setNameError("");
    // Only on opening. Re-seeding when the profile refreshes would wipe an
    // edit in progress.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const handleSave = async () => {
    const trimmed = name.trim();
    // Mirror the server's username rules so problems surface inline, not as a toast.
    let error = "";
    if (!trimmed) error = "Enter a display name.";
    else if (trimmed.length < 3) error = "Use at least 3 characters.";
    else if (trimmed.length > 20) error = "Keep it to 20 characters or fewer.";
    else if (!/^[A-Za-z0-9_]+$/.test(trimmed))
      error = "Only letters, numbers and underscores.";
    if (error) {
      setNameError(error);
      nameShake.start(SHAKE);
      return;
    }

    setNameError("");
    setSaving(true);
    try {
      await updateProfile({ username: trimmed, avatar });
      await refresh();
      onClose();
      toast.success("Profile updated");
    } catch (err) {
      setNameError(err?.response?.data?.message || "Couldn't update profile.");
      nameShake.start(SHAKE);
    } finally {
      setSaving(false);
    }
  };

  return (
    <BottomSheet open={open} onClose={onClose} title="Edit Profile">
      <div className="space-y-5">
        <div className="space-y-2">
          <Label>Avatar</Label>
          <div className="grid grid-cols-3 gap-2">
            {/* Default (Google photo / initial) */}
            <AvatarTile
              selected={avatar === ""}
              label="Default"
              onClick={() => setAvatar("")}
            >
              <Avatar user={{ ...user, avatar: "" }} className="h-10 w-10" />
            </AvatarTile>

            {AVATARS.map((a) => (
              <AvatarTile
                key={a.id}
                selected={avatar === a.id}
                label={a.label}
                onClick={() => setAvatar(a.id)}
              >
                <img
                  src={avatarSrc(a.id)}
                  alt=""
                  className="h-9 w-9"
                  draggable="false"
                />
              </AvatarTile>
            ))}
          </div>
        </div>

        <motion.div animate={nameShake} className="space-y-2">
          <Label
            htmlFor="display-name"
            className={nameError ? "text-negative" : undefined}
          >
            Display Name
          </Label>
          <Input
            id="display-name"
            value={name}
            maxLength={20}
            placeholder="Your username"
            aria-invalid={Boolean(nameError)}
            aria-describedby={nameError ? "display-name-error" : undefined}
            className={
              nameError
                ? "border-negative focus-visible:border-negative focus-visible:ring-negative"
                : undefined
            }
            onChange={(e) => {
              setName(e.target.value);
              setNameError("");
            }}
          />
          {nameError ? (
            <FieldError id="display-name-error">{nameError}</FieldError>
          ) : (
            <p className="text-[12px] leading-relaxed text-ink-3">
              3–20 letters, numbers or underscores. Friends find you by this.
            </p>
          )}
        </motion.div>

        <Button onClick={handleSave} disabled={saving} className="w-full">
          {saving ? "Saving…" : "Save Changes"}
        </Button>
      </div>
    </BottomSheet>
  );
}

function AvatarTile({ selected, label, onClick, children }) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileTap={{ scale: 0.9 }}
      aria-pressed={selected}
      className={`relative flex min-h-[84px] flex-col items-center justify-center gap-1.5 rounded-sm border p-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface ${
        selected
          ? "border-ink bg-ink/[0.06]"
          : "border-hairline-strong hover:bg-surface-2 active:bg-surface-3"
      }`}
    >
      {selected && (
        <span className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-ink text-surface">
          <Check className="h-3 w-3" strokeWidth={3} />
        </span>
      )}
      {children}
      <span className="text-[11px] font-medium leading-tight text-ink-3">
        {label}
      </span>
    </motion.button>
  );
}
