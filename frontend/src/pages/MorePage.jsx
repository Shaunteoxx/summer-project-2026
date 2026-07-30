import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, useAnimationControls } from "framer-motion";
import {
  BarChart3,
  Users,
  Sun,
  Moon,
  LogOut,
  ChevronRight,
  Pencil,
  Check,
  Trash2,
  AlertTriangle,
  PiggyBank,
  ChevronLeft,
} from "lucide-react";

import PageWrapper from "@/components/PageWrapper";
import Avatar from "@/components/Avatar";
import BottomSheet from "@/components/BottomSheet";
import FieldError from "@/components/FieldError";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/useAuth";
import { useTheme } from "@/hooks/useTheme";
import { useToast } from "@/hooks/useToast";
import { useDemoGuard } from "@/hooks/useDemoGuard";
import { AVATARS, avatarSrc } from "@/lib/avatars";
import { formatMoney, monthName } from "@/lib/utils";
import { updateProfile, deleteAccount, setMonthlySavings } from "@/api/endpoints";
import { staggerContainer, fadeUp, fadeScaleItem, SHAKE } from "@/animations/variants";

const shortcuts = [
  {
    to: "/stats",
    label: "Stats",
    desc: "Spending breakdown & trends",
    icon: BarChart3,
  },
  {
    to: "/friends",
    label: "Friends",
    desc: "Compare savings on the leaderboard",
    icon: Users,
  },
];

export default function MorePage() {
  const navigate = useNavigate();
  const { user, refresh, logout, clearSession } = useAuth();
  const { isDark, toggleTheme } = useTheme();
  const toast = useToast();
  const guard = useDemoGuard();

  const [editOpen, setEditOpen] = useState(false);
  const [name, setName] = useState("");
  const [avatar, setAvatar] = useState("");
  const [saving, setSaving] = useState(false);
  const [nameError, setNameError] = useState("");
  const nameShake = useAnimationControls();

  const [savingsOpen, setSavingsOpen] = useState(false);
  const [savingsInput, setSavingsInput] = useState("");
  const [savingSavings, setSavingSavings] = useState(false);
  const [savingsError, setSavingsError] = useState("");
  const savingsShake = useAnimationControls();
  const now = new Date();
  const [savingsYear, setSavingsYear] = useState(now.getFullYear());
  const [savingsMonth, setSavingsMonth] = useState(now.getMonth());

  const savingsByMonth = user?.savingsByMonth ?? {};
  const keyFor = (y, m) => `${y}-${m}`;
  const currentMonthSavings = savingsByMonth[keyFor(now.getFullYear(), now.getMonth())] ?? 0;

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const openEdit = () => {
    if (guard()) return;
    setName(user?.username ?? "");
    setAvatar(user?.avatar ?? "");
    setNameError("");
    setEditOpen(true);
  };

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
      setEditOpen(false);
      toast.success("Profile updated");
    } catch (err) {
      setNameError(err?.response?.data?.message || "Couldn't update profile.");
      nameShake.start(SHAKE);
    } finally {
      setSaving(false);
    }
  };

  const loadSavingsInput = (y, m) => {
    const v = savingsByMonth[keyFor(y, m)];
    setSavingsInput(v ? String(v) : "");
    setSavingsError("");
  };

  const openSavings = () => {
    if (guard()) return;
    setSavingsYear(now.getFullYear());
    setSavingsMonth(now.getMonth());
    loadSavingsInput(now.getFullYear(), now.getMonth());
    setSavingsError("");
    setSavingsOpen(true);
  };

  const stepSavingsMonth = (delta) => {
    let y = savingsYear;
    let m = savingsMonth + delta;
    if (m < 0) {
      m = 11;
      y -= 1;
    } else if (m > 11) {
      m = 0;
      y += 1;
    }
    setSavingsYear(y);
    setSavingsMonth(m);
    loadSavingsInput(y, m);
  };

  const handleSaveSavings = async () => {
    const raw = savingsInput.trim();
    const amount = raw === "" ? 0 : Number(raw);
    let error = "";
    if (!Number.isFinite(amount) || amount < 0) error = "Enter $0 or more.";
    else if (amount > 1e9) error = "Keep it under $1,000,000,000.";
    if (error) {
      setSavingsError(error);
      savingsShake.start(SHAKE);
      return;
    }

    setSavingsError("");
    setSavingSavings(true);
    try {
      await setMonthlySavings({ key: keyFor(savingsYear, savingsMonth), amount });
      await refresh();
      setSavingsOpen(false);
      toast.success(`Savings set for ${monthName(savingsMonth)}`);
    } catch (err) {
      setSavingsError(err?.response?.data?.message || "Couldn't update savings.");
      savingsShake.start(SHAKE);
    } finally {
      setSavingSavings(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await deleteAccount();
      // The user row is gone, so the token is already dead — skip the logout
      // call it would 401 on and just clear locally.
      clearSession();
    } catch {
      setDeleting(false);
      toast.error("Couldn't delete account. Please try again.");
    }
  };

  return (
    <PageWrapper>
      {/* Profile header */}
      <motion.div variants={fadeUp} initial="initial" animate="animate">
        <div className="flex items-center gap-4">
          <button
            onClick={openEdit}
            aria-label="Edit profile"
            className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            <Avatar user={user} className="h-16 w-16" />
          </button>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-xl font-extrabold tracking-tight">
              {user?.username ?? "Your account"}
            </h1>
            {user?.email && (
              <p className="truncate text-sm text-muted-foreground">{user.email}</p>
            )}
          </div>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={openEdit}>
            <Pencil className="h-3.5 w-3.5" /> Edit
          </Button>
        </div>
      </motion.div>

      {/* Shortcuts */}
      <motion.div
        variants={staggerContainer(0.08, 0.1)}
        initial="initial"
        animate="animate"
        className="mt-7 space-y-3"
      >
        {shortcuts.map(({ to, label, desc, icon: Icon }) => (
          <motion.button
            key={to}
            variants={fadeScaleItem}
            whileTap={{ scale: 0.98 }}
            onClick={() => navigate(to)}
            className="flex w-full items-center gap-4 rounded-xl border border-border/70 bg-card p-4 text-left shadow-sm transition-colors hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent text-accent-foreground">
              <Icon className="h-5 w-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-semibold">{label}</span>
              <span className="block text-sm text-muted-foreground">{desc}</span>
            </span>
            <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
          </motion.button>
        ))}
      </motion.div>

      {/* Budget */}
      <motion.div variants={fadeUp} initial="initial" animate="animate" className="mt-7">
        <h2 className="mb-3 px-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Budget
        </h2>
        <div className="overflow-hidden rounded-xl border border-border/70 bg-card shadow-sm">
          <button
            onClick={openSavings}
            className="flex w-full items-center gap-4 p-4 text-left transition-colors hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
          >
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent text-accent-foreground">
              <PiggyBank className="h-5 w-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-semibold">Monthly savings</span>
              <span className="block text-sm text-muted-foreground">
                {monthName(now.getMonth())}, reserved before your budget
              </span>
            </span>
            <span className="shrink-0 font-semibold tabular-nums">
              {formatMoney(currentMonthSavings)}
            </span>
            <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
          </button>
        </div>
      </motion.div>

      {/* Preferences */}
      <motion.div variants={fadeUp} initial="initial" animate="animate" className="mt-7">
        <h2 className="mb-3 px-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Preferences
        </h2>
        <div className="overflow-hidden rounded-xl border border-border/70 bg-card shadow-sm">
          <button
            onClick={toggleTheme}
            className="flex w-full items-center gap-4 p-4 text-left transition-colors hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
          >
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent text-accent-foreground">
              {isDark ? <Moon className="h-5 w-5" /> : <Sun className="h-5 w-5" />}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-semibold">Appearance</span>
              <span className="block text-sm text-muted-foreground">
                {isDark ? "Dark mode" : "Light mode"}
              </span>
            </span>
            <span
              className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${
                isDark ? "bg-primary" : "bg-muted"
              }`}
              aria-hidden="true"
            >
              <motion.span
                layout
                transition={{ type: "spring", stiffness: 500, damping: 32 }}
                className={`absolute top-1 h-5 w-5 rounded-full bg-background shadow ${
                  isDark ? "right-1" : "left-1"
                }`}
              />
            </span>
          </button>
        </div>
      </motion.div>

      {/* Account */}
      <motion.div variants={fadeUp} initial="initial" animate="animate" className="mt-7">
        <h2 className="mb-3 px-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Account
        </h2>
        <div className="space-y-3">
          <button
            onClick={logout}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-border/70 bg-card p-4 font-semibold transition-colors hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            <LogOut className="h-5 w-5" />
            Log out
          </button>
          <button
            onClick={() => {
              if (guard()) return;
              setDeleteOpen(true);
            }}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-destructive/30 bg-destructive/5 p-4 font-semibold text-destructive transition-colors hover:bg-destructive/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            <Trash2 className="h-5 w-5" />
            Delete account
          </button>
        </div>
      </motion.div>

      <p className="mt-6 text-center text-xs text-muted-foreground">
        Broke No More · Avatars by Twemoji (CC-BY 4.0)
      </p>

      {/* Edit profile sheet */}
      <BottomSheet open={editOpen} onClose={() => setEditOpen(false)} title="Edit profile">
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
              className={nameError ? "text-destructive" : undefined}
            >
              Display name
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
                  ? "border-destructive focus-visible:ring-destructive"
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
              <p className="text-xs text-muted-foreground">
                3–20 letters, numbers or underscores. Friends find you by this.
              </p>
            )}
          </motion.div>

          <Button onClick={handleSave} disabled={saving} className="w-full">
            {saving ? "Saving…" : "Save changes"}
          </Button>
        </div>
      </BottomSheet>

      {/* Monthly savings sheet */}
      <BottomSheet
        open={savingsOpen}
        onClose={() => !savingSavings && setSavingsOpen(false)}
        title="Monthly savings"
      >
        <div className="space-y-4">
          {/* Month stepper */}
          <div className="flex items-center justify-between rounded-xl border border-border bg-muted/40 p-1">
            <button
              type="button"
              onClick={() => stepSavingsMonth(-1)}
              aria-label="Previous month"
              className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <span className="font-semibold tabular-nums">
              {monthName(savingsMonth)} {savingsYear}
            </span>
            <button
              type="button"
              onClick={() => stepSavingsMonth(1)}
              aria-label="Next month"
              className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          </div>

          <motion.div animate={savingsShake} className="space-y-2">
            <Label
              htmlFor="monthly-savings"
              className={savingsError ? "text-destructive" : undefined}
            >
              Amount to set aside in {monthName(savingsMonth)}
            </Label>
            <Input
              id="monthly-savings"
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              placeholder="0.00"
              value={savingsInput}
              aria-invalid={Boolean(savingsError)}
              aria-describedby={savingsError ? "monthly-savings-error" : undefined}
              className={
                savingsError
                  ? "border-destructive focus-visible:ring-destructive"
                  : undefined
              }
              onChange={(e) => {
                setSavingsInput(e.target.value);
                setSavingsError("");
              }}
            />
            {savingsError ? (
              <FieldError id="monthly-savings-error">{savingsError}</FieldError>
            ) : (
              <p className="text-xs text-muted-foreground">
                Reserved from this month's income first — your daily budget is
                what's left, spread over the days remaining.
              </p>
            )}
          </motion.div>
          <Button onClick={handleSaveSavings} disabled={savingSavings} className="w-full">
            {savingSavings ? "Saving…" : `Save for ${monthName(savingsMonth)}`}
          </Button>
        </div>
      </BottomSheet>

      {/* Delete account confirmation */}
      <BottomSheet
        open={deleteOpen}
        onClose={() => !deleting && setDeleteOpen(false)}
        title="Delete account"
      >
        <div className="space-y-5">
          <div className="flex items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
            <p className="text-sm text-muted-foreground">
              This permanently deletes your account, all your transactions and
              your savings history. This <strong>cannot be undone.</strong>
            </p>
          </div>
          <div className="flex gap-3">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => setDeleteOpen(false)}
              disabled={deleting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              className="flex-1"
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting ? "Deleting…" : "Delete account"}
            </Button>
          </div>
        </div>
      </BottomSheet>
    </PageWrapper>
  );
}

function AvatarTile({ selected, label, onClick, children }) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileTap={{ scale: 0.9 }}
      aria-pressed={selected}
      className={`relative flex min-h-[84px] flex-col items-center justify-center gap-1.5 rounded-xl border p-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card ${
        selected
          ? "border-primary bg-primary/10"
          : "border-border hover:bg-accent/50"
      }`}
    >
      {selected && (
        <span className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-primary-foreground">
          <Check className="h-3 w-3" strokeWidth={3} />
        </span>
      )}
      {children}
      <span className="text-[11px] font-medium leading-tight text-muted-foreground">
        {label}
      </span>
    </motion.button>
  );
}
