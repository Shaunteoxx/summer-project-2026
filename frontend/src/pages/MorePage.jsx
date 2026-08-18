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
  Check,
  Trash2,
  AlertTriangle,
  PiggyBank,
  ChevronLeft,
  CalendarRange,
  Wallet,
  Repeat,
  Tag,
} from "lucide-react";

import PageWrapper from "@/components/PageWrapper";
import Avatar from "@/components/Avatar";
import BottomSheet from "@/components/BottomSheet";
import FieldError from "@/components/FieldError";
import SwitchRow from "@/components/SwitchRow";
import AccountsSheet from "@/components/AccountsSheet";
import CategoriesSheet from "@/components/CategoriesSheet";
import RecurringSheet from "@/components/RecurringSheet";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/useAuth";
import { useBudgetPeriod } from "@/hooks/useBudgetPeriod";
import { useAccounts } from "@/hooks/useAccounts";
import { useCategories } from "@/hooks/useCategories";
import { useRecurring } from "@/hooks/useRecurring";
import { useTheme } from "@/hooks/useTheme";
import { useToast } from "@/hooks/useToast";
import { useDemoGuard } from "@/hooks/useDemoGuard";
import { AVATARS, avatarSrc } from "@/lib/avatars";
import { cn, formatMoney, monthName, localToday } from "@/lib/utils";
import {
  MAX_PERIOD_DAYS,
  MIN_PERIOD_DAYS,
  addDaysYmd,
  formatDay,
  formatPeriodLabel,
  periodEnd,
} from "@/lib/period";
import {
  updateProfile,
  deleteAccount,
  setMonthlySavings,
  setPeriodMode,
  startPeriod,
  updatePeriod,
  deletePeriod,
} from "@/api/endpoints";
import { fadeUp, SHAKE } from "@/animations/variants";

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
  const period = useBudgetPeriod();
  const { isDark, setTheme } = useTheme();
  const toast = useToast();
  const guard = useDemoGuard();
  const isDays = period.mode === "days";
  const { active: activeAccounts } = useAccounts();
  const accountCount = activeAccounts.length;
  const { custom: customCategories } = useCategories();
  const { rules, addRule, updateRule, removeRule } = useRecurring();
  const liveRules = rules.filter((r) => !r.paused).length;
  // `history` from the API is every period; the running one is rendered
  // separately above, so keep it out of the "Past periods" list.
  const pastPeriods = (period.history ?? []).filter(
    (p) => p.id !== period.current?.id
  );

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
  // Carry the target into each new month instead of re-entering it. Per-user
  // rather than per-month, so it's seeded from the profile every time the sheet
  // opens rather than from whichever month the stepper is on.
  const [repeatSavings, setRepeatSavings] = useState(false);

  const savingsByMonth = user?.savingsByMonth ?? {};
  const keyFor = (y, m) => `${y}-${m}`;
  const currentMonthSavings = savingsByMonth[keyFor(now.getFullYear(), now.getMonth())] ?? 0;
  // In days mode the target belongs to the running period, not the calendar.
  const currentSavings = isDays ? (period.current?.savings ?? 0) : currentMonthSavings;
  // The saved preference, as opposed to the sheet's unsaved toggle state.
  const repeatSavingsOn = !isDays && !!user?.repeatSavings;

  // Budget period sheet: mode toggle plus the form for starting the next one.
  const [periodOpen, setPeriodOpen] = useState(false);
  const [periodStart, setPeriodStart] = useState(localToday());
  const [periodLength, setPeriodLength] = useState("15");
  const [periodTarget, setPeriodTarget] = useState("");
  const [periodError, setPeriodError] = useState("");
  const [savingPeriod, setSavingPeriod] = useState(false);
  // Id of the period awaiting an inline "really delete?" confirmation.
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const periodShake = useAnimationControls();

  const [accountsOpen, setAccountsOpen] = useState(false);
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  const [recurringOpen, setRecurringOpen] = useState(false);

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
    if (isDays) {
      // Days mode edits the running period's own target — there's no month to
      // step through, and nothing to edit while no period is running.
      if (!period.current) {
        toast.error("Start a budget period first.");
        return;
      }
      setSavingsInput(period.current.savings ? String(period.current.savings) : "");
      setSavingsError("");
      setSavingsOpen(true);
      return;
    }
    setSavingsYear(now.getFullYear());
    setSavingsMonth(now.getMonth());
    loadSavingsInput(now.getFullYear(), now.getMonth());
    setRepeatSavings(!!user?.repeatSavings);
    setSavingsError("");
    setSavingsOpen(true);
  };

  const openPeriod = () => {
    if (guard()) return;
    // Default the next period to start the day after the last one ended, so
    // the common case is one tap.
    const suggested = period.previous ? addDaysYmd(period.previous.end, 1) : localToday();
    setPeriodStart(
      period.current
        ? period.current.start
        : suggested > localToday()
          ? localToday()
          : suggested
    );
    setPeriodLength(String(period.current?.days ?? period.previous?.days ?? 15));
    setPeriodTarget("");
    setPeriodError("");
    setConfirmDeleteId(null);
    setPeriodOpen(true);
  };

  const switchMode = async (mode) => {
    if (mode === period.mode) return;
    setPeriodError("");
    setSavingPeriod(true);
    try {
      await setPeriodMode(mode);
      await Promise.all([refresh(), period.refresh()]);
      toast.success(
        mode === "month" ? "Budgeting by calendar month" : "Budgeting by custom days"
      );
    } catch (err) {
      setPeriodError(err?.response?.data?.message || "Couldn't change the mode.");
      periodShake.start(SHAKE);
    } finally {
      setSavingPeriod(false);
    }
  };

  const handleStartPeriod = async () => {
    const length = Number(periodLength);
    let error = "";
    if (!periodStart) error = "Pick a start date.";
    else if (!Number.isInteger(length) || length < MIN_PERIOD_DAYS || length > MAX_PERIOD_DAYS)
      error = `Enter a whole number of days between ${MIN_PERIOD_DAYS} and ${MAX_PERIOD_DAYS}.`;
    const target = periodTarget.trim() === "" ? 0 : Number(periodTarget);
    if (!error && (!Number.isFinite(target) || target < 0)) error = "Enter $0 or more.";
    if (error) {
      setPeriodError(error);
      periodShake.start(SHAKE);
      return;
    }

    setPeriodError("");
    setSavingPeriod(true);
    try {
      await startPeriod({ start: periodStart, length, savingsTarget: target });
      await Promise.all([refresh(), period.refresh()]);
      setPeriodOpen(false);
      toast.success(`Period started — ${length} days`);
    } catch (err) {
      setPeriodError(err?.response?.data?.message || "Couldn't start the period.");
      periodShake.start(SHAKE);
    } finally {
      setSavingPeriod(false);
    }
  };

  const handleUpdatePeriod = async () => {
    const length = Number(periodLength);
    let error = "";
    if (!periodStart) error = "Pick a start date.";
    else if (periodStart > localToday()) error = "Start Date can't be in the future.";
    else if (!Number.isInteger(length) || length < MIN_PERIOD_DAYS || length > MAX_PERIOD_DAYS)
      error = `Enter a whole number of days between ${MIN_PERIOD_DAYS} and ${MAX_PERIOD_DAYS}.`;
    if (error) {
      setPeriodError(error);
      periodShake.start(SHAKE);
      return;
    }
    setPeriodError("");
    setSavingPeriod(true);
    try {
      await updatePeriod(period.current.id, { start: periodStart, length });
      await period.refresh();
      setPeriodOpen(false);
      toast.success("Period updated");
    } catch (err) {
      setPeriodError(err?.response?.data?.message || "Couldn't update the period.");
      periodShake.start(SHAKE);
    } finally {
      setSavingPeriod(false);
    }
  };

  const handleDeletePeriod = async (id) => {
    setPeriodError("");
    setSavingPeriod(true);
    try {
      await deletePeriod(id);
      await period.refresh();
      setConfirmDeleteId(null);
      toast.success("Period removed — its transactions were kept");
    } catch (err) {
      setPeriodError(err?.response?.data?.message || "Couldn't remove the period.");
      periodShake.start(SHAKE);
    } finally {
      setSavingPeriod(false);
    }
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
      if (isDays) {
        await updatePeriod(period.current.id, { savingsTarget: amount });
        await period.refresh();
        setSavingsOpen(false);
        toast.success("Savings target updated");
        return;
      }
      await setMonthlySavings({
        key: keyFor(savingsYear, savingsMonth),
        amount,
        repeat: repeatSavings,
      });
      await refresh();
      setSavingsOpen(false);
      toast.success(
        repeatSavings
          ? `Savings set for ${monthName(savingsMonth)} and every month after`
          : `Savings set for ${monthName(savingsMonth)}`
      );
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
        <div className="flex items-center gap-3.5">
          <button
            onClick={openEdit}
            aria-label="Edit profile"
            className="shrink-0 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            <Avatar user={user} className="h-[54px] w-[54px]" />
          </button>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-[19px] font-semibold tracking-[-0.02em]">
              {user?.username ?? "Your Account"}
            </h1>
            {user?.email && (
              <p className="mt-0.5 truncate text-meta text-ink-3">{user.email}</p>
            )}
          </div>
          <Button
            variant="outline"
            onClick={openEdit}
            className="h-8 shrink-0 rounded-sm px-3.5 text-[13px] font-medium"
          >
            Edit
          </Button>
        </div>
      </motion.div>

      {/* Browse — Stats and Friends are destinations, not settings, but they
          live behind this tab, so they read as the first list on the page. */}
      <Section label="Browse">
        {shortcuts.map(({ to, label, desc, icon }) => (
          <Row
            key={to}
            icon={icon}
            title={label}
            meta={desc}
            onClick={() => navigate(to)}
          />
        ))}
      </Section>

      {/* Budget — each row's current setting sits at the right edge as a
          tabular figure, so the section reads as a summary you can scan
          rather than four descriptions you have to parse. */}
      <Section label="Budget">
        <Row
          icon={CalendarRange}
          title="Budget Period"
          meta={
            !isDays
              ? "Resets on the 1st"
              : period.current
                ? formatPeriodLabel(period.current)
                : period.status === "lapsed"
                  ? "Ended — start the next one"
                  : "Not set up yet"
          }
          value={
            isDays && period.status !== "active" ? (
              <span className="shrink-0 rounded-xs bg-surface-2 px-1.5 py-[3px] text-[11px] font-medium text-ink-2">
                Action Needed
              </span>
            ) : (
              <RowValue>
                {!isDays ? "Monthly" : `${period.current?.days ?? 0} days`}
              </RowValue>
            )
          }
          onClick={openPeriod}
        />
        <Row
          icon={Wallet}
          title="Bank Accounts"
          meta="Tag where money comes and goes"
          value={<RowValue>{accountCount}</RowValue>}
          onClick={() => {
            if (guard()) return;
            setAccountsOpen(true);
          }}
        />
        <Row
          icon={Tag}
          title="Categories"
          meta="Your own, on top of the built-in ones"
          value={<RowValue>{customCategories.length}</RowValue>}
          onClick={() => {
            if (guard()) return;
            setCategoriesOpen(true);
          }}
        />
        <Row
          icon={Repeat}
          title="Repeating Entries"
          meta={
            rules.length === 0
              ? "Add rent and subscriptions once"
              : liveRules === rules.length
                ? "Added automatically"
                : `${liveRules} of ${rules.length} running`
          }
          value={<RowValue>{rules.length}</RowValue>}
          onClick={() => {
            if (guard()) return;
            setRecurringOpen(true);
          }}
        />
        <Row
          icon={PiggyBank}
          title="Savings Target"
          meta={
            isDays
              ? period.current
                ? `${formatPeriodLabel(period.current)} · reserved first`
                : "Start a period to set one"
              : repeatSavingsOn
                ? `${monthName(now.getMonth())} · repeats monthly`
                : `${monthName(now.getMonth())} · reserved first`
          }
          value={<RowValue strong>{formatMoney(currentSavings)}</RowValue>}
          onClick={openSavings}
        />
      </Section>

      {/* Preferences */}
      <Section label="Preferences">
        <Row
          icon={isDark ? Moon : Sun}
          title="Appearance"
          meta={isDark ? "Dark Mode" : "Light Mode"}
          chevron={false}
          value={
            <Segmented
              label="Appearance"
              options={[
                { value: "light", label: "Light" },
                { value: "dark", label: "Dark" },
              ]}
              value={isDark ? "dark" : "light"}
              onChange={setTheme}
            />
          }
        />
      </Section>

      {/* Account */}
      <Section label="Account">
        <Row icon={LogOut} title="Log Out" chevron={false} onClick={logout} />
      </Section>

      {/* Deleting your account is a real action but not a common one. As a
          full-width red button it had the same visual weight as Log out and
          more than anything above it; as a text link it stays reachable
          without shouting. The confirmation sheet is unchanged. */}
      <div className="mt-[30px] text-center">
        <button
          onClick={() => {
            if (guard()) return;
            setDeleteOpen(true);
          }}
          className="rounded-sm px-2.5 py-1.5 text-[13px] font-medium text-negative transition-colors duration-base ease-out hover:bg-negative/[0.08] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-negative"
        >
          Delete Account
        </button>
        <p className="mt-4 text-[11.5px] leading-relaxed text-ink-3">
          Broke No More · Avatars by Twemoji (CC-BY 4.0)
        </p>
      </div>

      {/* Edit profile sheet */}
      <BottomSheet open={editOpen} onClose={() => setEditOpen(false)} title="Edit Profile">
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

      <AccountsSheet open={accountsOpen} onClose={() => setAccountsOpen(false)} />

      <CategoriesSheet
        open={categoriesOpen}
        onClose={() => setCategoriesOpen(false)}
      />

      <RecurringSheet
        open={recurringOpen}
        onClose={() => setRecurringOpen(false)}
        rules={rules}
        onAdd={addRule}
        onUpdate={updateRule}
        onRemove={removeRule}
      />

      {/* Savings target sheet */}
      <BottomSheet
        open={savingsOpen}
        onClose={() => !savingSavings && setSavingsOpen(false)}
        title="Savings Target"
      >
        <div className="space-y-4">
          {/* Month stepper — days mode edits the running period instead, so
              there's nothing to step through. */}
          <div
            className={`flex items-center justify-between rounded-md bg-surface-2 p-1 ${
              isDays ? "hidden" : ""
            }`}
          >
            <button
              type="button"
              onClick={() => stepSavingsMonth(-1)}
              aria-label="Previous month"
              className="flex h-9 w-9 items-center justify-center rounded-sm text-ink-2 transition-colors duration-base ease-out hover:bg-surface-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <span className="num text-[15px] font-semibold">
              {monthName(savingsMonth)} {savingsYear}
            </span>
            <button
              type="button"
              onClick={() => stepSavingsMonth(1)}
              aria-label="Next month"
              className="flex h-9 w-9 items-center justify-center rounded-sm text-ink-2 transition-colors duration-base ease-out hover:bg-surface-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          </div>

          <motion.div animate={savingsShake} className="space-y-2">
            <Label
              htmlFor="monthly-savings"
              className={savingsError ? "text-negative" : undefined}
            >
              Amount to set aside in{" "}
              {isDays ? formatPeriodLabel(period.current) : monthName(savingsMonth)}
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
                  ? "border-negative focus-visible:border-negative focus-visible:ring-negative"
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
              <p className="text-[12px] leading-relaxed text-ink-3">
                Reserved from this {isDays ? "period" : "month"}'s income first —
                your daily budget is what's left, spread over the days remaining.
              </p>
            )}
          </motion.div>
          {/* Days mode has no run of months to repeat across — each period
              carries its own target. */}
          {!isDays && (
            <SwitchRow
              checked={repeatSavings}
              onChange={setRepeatSavings}
              disabled={savingSavings}
              label="Repeat Every Month"
              description="New months start with your latest target, so you don't have to set it again."
            />
          )}

          <Button onClick={handleSaveSavings} disabled={savingSavings} className="w-full">
            {savingSavings
              ? "Saving…"
              : `Save for ${isDays ? formatPeriodLabel(period.current) : monthName(savingsMonth)}`}
          </Button>
        </div>
      </BottomSheet>

      {/* Budget period sheet */}
      <BottomSheet
        open={periodOpen}
        onClose={() => !savingPeriod && setPeriodOpen(false)}
        title="Budget Period"
      >
        <motion.div animate={periodShake} className="space-y-5">
          {/* Mode toggle */}
          <div
            className="grid grid-cols-2 gap-0.5 rounded-md bg-surface-2 p-[3px]"
            role="group"
            aria-label="Budget period mode"
          >
            {/* One line each. The hints that used to sit under these labels
                ("Calendar", "Custom Length") said less than the paragraph
                right below, and made this the only two-line segmented control
                in the app. */}
            <ModeTab
              active={!isDays}
              disabled={savingPeriod}
              onClick={() => switchMode("month")}
              label="Month"
            />
            <ModeTab
              active={isDays}
              disabled={savingPeriod}
              onClick={() => switchMode("days")}
              label="Days"
            />
          </div>

          {!isDays ? (
            <p className="text-[13px] leading-relaxed text-ink-3">
              Your budget runs from the 1st to the last day of each calendar
              month, and your daily budget is what's left spread over the days
              remaining. Switch to <strong>Days</strong> if your allowance covers
              something other than a month — a fortnight, or five weeks.
            </p>
          ) : (
            <>
              {period.current ? (
                <div className="space-y-4">
                  {/* A well, not a bordered card: it states what's running, it
                      isn't a control, and a border would give it the same
                      weight as the fields underneath that are. */}
                  <div className="rounded-xl bg-surface-2 p-4">
                    <p className="text-overline text-ink-3">Running now</p>
                    <p className="mt-1.5 text-[15px] font-semibold tracking-[-0.01em]">
                      {formatPeriodLabel(period.current)}
                    </p>
                    <p className="mt-0.5 text-[12.5px] text-ink-3">
                      {period.current.days} days ·{" "}
                      {period.current.daysLeft === 0
                        ? "ends today"
                        : `${period.current.daysLeft} left`}{" "}
                      · {period.current.savesTotal} restore
                      {period.current.savesTotal === 1 ? "" : "s"}
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="period-edit-start">Start Date</Label>
                    <Input
                      id="period-edit-start"
                      type="date"
                      value={periodStart}
                      max={localToday()}
                      onChange={(e) => {
                        setPeriodStart(e.target.value);
                        setPeriodError("");
                      }}
                    />
                  </div>

                  <LengthField
                    id="period-length"
                    value={periodLength}
                    disabled={savingPeriod}
                    onChange={(v) => {
                      setPeriodLength(v);
                      setPeriodError("");
                    }}
                  >
                    <p className="text-[12px] leading-relaxed text-ink-3">
                      Runs to{" "}
                      <strong>
                        {periodStart && Number(periodLength) >= MIN_PERIOD_DAYS
                          ? formatDay(periodEnd(periodStart, Number(periodLength)), {
                              withYear: true,
                            })
                          : "—"}
                      </strong>
                      . Your daily budget is recalculated from what&apos;s left.
                    </p>
                  </LengthField>

                  {periodError && <FieldError>{periodError}</FieldError>}

                  <Button
                    onClick={handleUpdatePeriod}
                    disabled={savingPeriod}
                    className="w-full"
                  >
                    {savingPeriod ? "Saving…" : "Save Changes"}
                  </Button>

                  {/* Removing the running period — the escape hatch for one
                      started by mistake. */}
                  {confirmDeleteId === period.current.id ? (
                    <div className="space-y-3 rounded-xl border border-destructive/30 bg-destructive/5 p-3">
                      <p className="text-[12px] leading-relaxed text-ink-3">
                        Remove <strong>{formatPeriodLabel(period.current)}</strong>?
                        Its days stop being budgeted and drop out of your streak.
                        <strong> Your transactions are kept</strong> and still
                        count on Stats.
                      </p>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex-1"
                          disabled={savingPeriod}
                          onClick={() => setConfirmDeleteId(null)}
                        >
                          Cancel
                        </Button>
                        <Button
                          variant="destructive"
                          size="sm"
                          className="flex-1"
                          disabled={savingPeriod}
                          onClick={() => handleDeletePeriod(period.current.id)}
                        >
                          {savingPeriod ? "Removing…" : "Remove Period"}
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteId(period.current.id)}
                      className="w-full rounded-sm py-3 text-center text-[13px] font-medium text-negative transition-colors duration-base ease-out hover:bg-negative/[0.08] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-negative"
                    >
                      Remove This Period
                    </button>
                  )}
                </div>
              ) : (
                <div className="space-y-4">
                  {period.status === "lapsed" && period.previous && (
                    <div className="rounded-lg border border-hairline bg-surface-2 p-4">
                      <p className="text-[13px] leading-relaxed text-ink-3">
                        Your last period ran{" "}
                        <strong className="text-foreground">
                          {formatPeriodLabel(period.previous)}
                        </strong>{" "}
                        and has ended. Days since then aren't tracked until you
                        start the next one.
                      </p>
                    </div>
                  )}

                  <div className="space-y-2">
                    <Label htmlFor="period-start">Start Date</Label>
                    <Input
                      id="period-start"
                      type="date"
                      value={periodStart}
                      max={localToday()}
                      onChange={(e) => {
                        setPeriodStart(e.target.value);
                        setPeriodError("");
                      }}
                    />
                  </div>

                  <LengthField
                    id="period-new-length"
                    value={periodLength}
                    disabled={savingPeriod}
                    onChange={(v) => {
                      setPeriodLength(v);
                      setPeriodError("");
                    }}
                  >
                    {periodStart && Number(periodLength) >= MIN_PERIOD_DAYS && (
                      <p className="text-[12px] leading-relaxed text-ink-3">
                        Runs until{" "}
                        <strong>
                          {formatDay(periodEnd(periodStart, Number(periodLength)), {
                            withYear: true,
                          })}
                        </strong>
                        .
                      </p>
                    )}
                  </LengthField>

                  <div className="space-y-2">
                    <Label htmlFor="period-target">Savings target (optional)</Label>
                    <Input
                      id="period-target"
                      type="number"
                      inputMode="decimal"
                      min="0"
                      step="0.01"
                      placeholder="0.00"
                      value={periodTarget}
                      onChange={(e) => {
                        setPeriodTarget(e.target.value);
                        setPeriodError("");
                      }}
                    />
                  </div>

                  {periodError && <FieldError>{periodError}</FieldError>}

                  <Button
                    onClick={handleStartPeriod}
                    disabled={savingPeriod}
                    className="w-full"
                  >
                    {savingPeriod ? "Starting…" : "Start Period"}
                  </Button>
                </div>
              )}

              {pastPeriods.length > 0 && (
                <div className="space-y-2 border-t border-hairline pt-4">
                  <p className="text-overline text-ink-3">
                    Past periods
                  </p>
                  <ul className="space-y-1.5">
                    {pastPeriods.slice(0, 5).map((p) => (
                      <li key={p.id}>
                        {confirmDeleteId === p.id ? (
                          <div className="space-y-2 rounded-lg border border-destructive/30 bg-destructive/5 p-2.5">
                            <p className="text-[12px] leading-relaxed text-ink-3">
                              Remove <strong>{formatPeriodLabel(p)}</strong>? Its
                              days stop being budgeted.{" "}
                              <strong>Transactions are kept.</strong>
                            </p>
                            <div className="flex gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-7 flex-1 text-xs"
                                disabled={savingPeriod}
                                onClick={() => setConfirmDeleteId(null)}
                              >
                                Cancel
                              </Button>
                              <Button
                                variant="destructive"
                                size="sm"
                                className="h-7 flex-1 text-xs"
                                disabled={savingPeriod}
                                onClick={() => handleDeletePeriod(p.id)}
                              >
                                Remove
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-center justify-between gap-2 text-sm">
                            <span className="min-w-0 flex-1 truncate">
                              {formatPeriodLabel(p)}
                            </span>
                            <span className="num shrink-0 text-[12px] text-ink-3">
                              {p.days} days
                              {p.savings > 0 ? ` · ${formatMoney(p.savings)}` : ""}
                            </span>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteId(p.id)}
                              aria-label={`Remove ${formatPeriodLabel(p)}`}
                              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-sm text-ink-3 transition-colors duration-base ease-out hover:bg-negative/[0.08] hover:text-negative focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-negative"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </motion.div>
      </BottomSheet>

      {/* Delete Account confirmation */}
      <BottomSheet
        open={deleteOpen}
        onClose={() => !deleting && setDeleteOpen(false)}
        title="Delete Account"
      >
        <div className="space-y-5">
          <div className="flex items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-negative" />
            <p className="text-[13px] leading-relaxed text-ink-3">
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
              {deleting ? "Deleting…" : "Delete Account"}
            </Button>
          </div>
        </div>
      </BottomSheet>
    </PageWrapper>
  );
}

function ModeTab({ active, disabled, onClick, label }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      className={`rounded-[9px] px-3 py-1.5 text-center text-[13px] transition-colors disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
        active
          ? "bg-surface font-semibold text-ink shadow-card dark:bg-surface-3"
          : "font-medium text-ink-3 hover:text-ink-2"
      }`}
    >
      {label}
    </button>
  );
}

/**
 * Length in Days, with the four lengths people actually use one tap away.
 *
 * Shared by both branches of the sheet. It used to exist only on the "start a
 * new period" form, so changing the length of a running one meant clearing a
 * number field and typing — the harder half of the same job.
 */
function LengthField({ id, value, onChange, disabled, children }) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>Length in Days</Label>
      <Input
        id={id}
        type="number"
        inputMode="numeric"
        min={MIN_PERIOD_DAYS}
        max={MAX_PERIOD_DAYS}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
      />
      <div className="flex flex-wrap gap-1.5">
        {[7, 14, 15, 30].map((n) => (
          <button
            key={n}
            type="button"
            disabled={disabled}
            aria-pressed={Number(value) === n}
            onClick={() => onChange(String(n))}
            className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
              Number(value) === n
                ? "border-transparent bg-ink text-surface"
                : "border-hairline-strong text-ink-2 hover:bg-surface-2"
            }`}
          >
            {n} days
          </button>
        ))}
      </div>
      {children}
    </div>
  );
}

/* ── Settings list primitives ───────────────────────────────────────────
   A labelled group of rows in one card, which is what the whole page is now.
   Rows are separated by a hairline rather than each being its own card — the
   old version gave every setting a card, so nothing on the page was quieter
   than anything else.                                                      */

export function Section({ label, children }) {
  return (
    <motion.section
      variants={fadeUp}
      initial="initial"
      animate="animate"
      className="mt-6"
    >
      <h2 className="mb-2.5 px-0.5 text-overline text-ink-3">{label}</h2>
      <Card className="overflow-hidden [&>*+*]:border-t [&>*+*]:border-hairline">
        {children}
      </Card>
    </motion.section>
  );
}

/**
 * One settings row: a 34px tile, a title with optional meta line, an optional
 * right-edge value, and a chevron when the row leads somewhere.
 *
 * Renders as a button only when it does something — a static row shouldn't be
 * in the tab order or announce itself as clickable.
 */
export function Row({ icon: Icon, title, meta, value, onClick, chevron = true }) {
  const Tag = onClick ? "button" : "div";

  return (
    <Tag
      {...(onClick ? { onClick, type: "button" } : {})}
      className={cn(
        "flex w-full items-center gap-3 px-4 py-[13px] text-left",
        onClick &&
          "transition-colors duration-base ease-out hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
      )}
    >
      <span className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-sm bg-surface-2 text-ink-2">
        <Icon className="h-4 w-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-medium tracking-[-0.01em]">
          {title}
        </span>
        {meta && (
          <span className="mt-0.5 block truncate text-meta text-ink-3">{meta}</span>
        )}
      </span>
      {value}
      {chevron && onClick && (
        <ChevronRight className="h-4 w-4 shrink-0 text-ink-3" />
      )}
    </Tag>
  );
}

/** The current setting, right-aligned in tabular figures. */
export function RowValue({ children, strong }) {
  return (
    <span
      className={cn(
        "num shrink-0",
        strong ? "text-[14px] font-semibold text-ink" : "text-[13px] font-medium text-ink-2"
      )}
    >
      {children}
    </span>
  );
}

/**
 * Segmented control. Replaces the theme toggle switch: a switch implies
 * on/off, but light and dark are two peers — and the labels say which is
 * which without the user having to work out what "on" meant.
 */
export function Segmented({ label, options, value, onChange, className }) {
  return (
    <div
      role="group"
      aria-label={label}
      className={cn("flex shrink-0 gap-0.5 rounded-md bg-surface-2 p-[3px]", className)}
    >
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(o.value)}
            className={cn(
              "rounded-[9px] px-3.5 py-1.5 text-[13px] transition-colors duration-base ease-out",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              on
                ? "bg-surface font-semibold text-ink shadow-card dark:bg-surface-3"
                : "font-medium text-ink-3"
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
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
          : "border-hairline-strong hover:bg-surface-2"
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
