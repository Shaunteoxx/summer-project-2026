import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Calculator,
  Users,
  Sun,
  Moon,
  LogOut,
  PiggyBank,
  CalendarRange,
  Wallet,
  Repeat,
  Tag,
  Bell,
  Vibrate,
  Compass,
  Lightbulb,
  Smartphone,
} from "lucide-react";

import PageWrapper from "@/components/PageWrapper";
import Avatar from "@/components/Avatar";
import { SwitchTrack } from "@/components/SwitchRow";
import AccountsSheet from "@/components/AccountsSheet";
import CategoriesSheet from "@/components/CategoriesSheet";
import RecurringSheet from "@/components/RecurringSheet";
import ToursSheet from "@/components/ToursSheet";
import AppIconSheet from "@/components/AppIconSheet";
import EditProfileSheet from "@/components/EditProfileSheet";
import SavingsTargetSheet from "@/components/SavingsTargetSheet";
import BudgetPeriodSheet from "@/components/BudgetPeriodSheet";
import DeleteAccountSheet from "@/components/DeleteAccountSheet";
import NotificationsSheet, { DEFAULT_HOURS, notificationsMeta } from "@/components/NotificationsSheet";
import { Section, Row, RowValue, Segmented } from "@/components/SettingsList";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { useBudgetPeriod } from "@/hooks/useBudgetPeriod";
import { useAccounts } from "@/hooks/useAccounts";
import { useCategories } from "@/hooks/useCategories";
import { useRecurring } from "@/hooks/useRecurring";
import { useTheme } from "@/hooks/useTheme";
import { useToast } from "@/hooks/useToast";
import { useDemoGuard } from "@/hooks/useDemoGuard";
import { useCoarsePointer } from "@/hooks/useCoarsePointer";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import { isStandalone } from "@/lib/push";
import { haptic, hapticsEnabled, setHapticsEnabled } from "@/lib/haptics";
import { appIcon, canChooseAppIcon } from "@/lib/appIcon";
import { useTour, useTourContext } from "@/tour/TourProvider";
import { formatMoney, monthName } from "@/lib/utils";
import { formatPeriodLabel } from "@/lib/period";
import { fadeUp } from "@/animations/variants";

const shortcuts = [
  // Plan lives here rather than in the bottom tab bar: it's an occasional
  // what-if tool that runs on the same numbers as Home, not a daily
  // destination, so it didn't earn one of four tab slots. It's still one tap
  // from Home (the pace card and the streak card both link into it). Stats is
  // no longer here at all — it became the History view of the Tracker.
  {
    to: "/plan",
    label: "Plan",
    desc: "See what today's spending leaves ahead",
    icon: Calculator,
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
  const { user, refresh, logout } = useAuth();
  const period = useBudgetPeriod();
  const { isDark, setTheme } = useTheme();
  const toast = useToast();
  const guard = useDemoGuard();
  const notifications = usePushNotifications(user, refresh);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  // Only iPhone and iPad take their Home Screen icon from the page, and only
  // when it's added from Safari: see lib/appIcon.js. Read on every render, so
  // the row picks up a new choice when its sheet closes.
  const [appIconOpen, setAppIconOpen] = useState(false);
  const iconChoice = canChooseAppIcon();
  const installed = isStandalone();
  const homeIcon = appIcon();
  // Only offered on a touch device: a laptop has nothing to vibrate, and a
  // switch that does nothing reads as broken.
  const touchDevice = useCoarsePointer();
  const [vibration, setVibration] = useState(hapticsEnabled);
  const toggleVibration = () => {
    const on = !vibration;
    setHapticsEnabled(on);
    setVibration(on);
    // Turning it on answers with a tap, so you know what you've turned on.
    if (on) haptic();
  };
  const isDays = period.mode === "days";
  // Term cycles are calendar months, so everything about savings follows the
  // month path — only the Budget Period row needs to know.
  const isTerm = period.mode === "term";
  const { active: activeAccounts } = useAccounts();
  const accountCount = activeAccounts.length;
  const { custom: customCategories } = useCategories();
  const { rules, addRule, updateRule, removeRule } = useRecurring();
  const liveRules = rules.filter((r) => !r.paused).length;

  // Which sheet is open. Each sheet keeps its own form; the page only decides
  // whether it may open (the demo guard, a period to edit) and opens it.
  const [editOpen, setEditOpen] = useState(false);
  const [savingsOpen, setSavingsOpen] = useState(false);
  const [periodOpen, setPeriodOpen] = useState(false);
  const [accountsOpen, setAccountsOpen] = useState(false);
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  const [recurringOpen, setRecurringOpen] = useState(false);
  const [toursOpen, setToursOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const tour = useTourContext();

  // The Savings Target row's figure and caption.
  const now = new Date();
  const savingsByMonth = user?.savingsByMonth ?? {};
  const keyFor = (y, m) => `${y}-${m}`;
  const currentMonthSavings = savingsByMonth[keyFor(now.getFullYear(), now.getMonth())] ?? 0;
  // In days mode the target belongs to the running period, not the calendar.
  const currentSavings = isDays ? (period.current?.savings ?? 0) : currentMonthSavings;
  // The saved preference, as opposed to the sheet's unsaved toggle state.
  const repeatSavingsOn = !isDays && !!user?.repeatSavings;

  const openEdit = () => {
    if (guard()) return;
    setEditOpen(true);
  };

  const openSavings = () => {
    if (guard()) return;
    // Days mode edits the running period's own target, so there's nothing to
    // edit while no period is running.
    if (isDays && !period.current) {
      toast.error("Start a budget period first.");
      return;
    }
    setSavingsOpen(true);
  };

  const openPeriod = () => {
    if (guard()) return;
    setPeriodOpen(true);
  };

  // Another screen can ask for one of these sheets by name — the same trick
  // /transactions uses for `openAdd`. Without it, a button saying "Start Next
  // Period" could only drop the reader on this page and leave them to find the
  // row themselves, which is what made every prompt in the app a dead end.
  //
  // Consumed once and wiped off the history entry: router state lives in
  // history.state and survives a reload, so leaving it there would re-open the
  // sheet on every refresh, long after the tap that asked for it. Replacing
  // state alone doesn't remount the page — App.jsx keys the outlet on pathname.
  const { state: navState, pathname } = useLocation();
  // When a deep link opens one of these sheets, hand the reader back where they
  // came from once it closes. The CTA that sent them here (Home, Plan, Tracker)
  // pushed /more onto history, so the entry right behind /more is that origin —
  // navigate(-1) returns to it whether they saved or backed out, instead of
  // stranding them on this settings list. Only armed for a deep link, so
  // opening a sheet from the More list itself stays put.
  const [deepReturn, setDeepReturn] = useState(null); // { which, opened } | null
  useEffect(() => {
    const which = navState?.open;
    if (!which) return;
    navigate(pathname, { replace: true, state: null });
    const openers = {
      period: openPeriod,
      savings: openSavings,
      accounts: () => !guard() && setAccountsOpen(true),
      categories: () => !guard() && setCategoriesOpen(true),
      recurring: () => !guard() && setRecurringOpen(true),
    };
    if (openers[which]) {
      setDeepReturn({ which, opened: false });
      openers[which]();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navState, pathname]);

  // Fire the return once the deep-linked sheet has actually opened and then
  // closed. The "opened" gate matters: arming and opening happen in the same
  // render, so without waiting for open to go true first this would read the
  // still-closed sheet and navigate away on the spot. Watching the open flags
  // (rather than a sheet's onClose) also catches the programmatic close on a
  // successful save, which never fires onClose.
  const sheetOpen = {
    period: periodOpen,
    savings: savingsOpen,
    accounts: accountsOpen,
    categories: categoriesOpen,
    recurring: recurringOpen,
  };
  useEffect(() => {
    if (!deepReturn) return;
    const isOpen = sheetOpen[deepReturn.which];
    if (isOpen && !deepReturn.opened) {
      setDeepReturn((r) => (r ? { ...r, opened: true } : r));
    } else if (deepReturn.opened && !isOpen) {
      setDeepReturn(null);
      navigate(-1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deepReturn, periodOpen, savingsOpen, accountsOpen, categoriesOpen, recurringOpen]);

  // This page's tour — but not on a visit that only came here for one sheet
  // and is about to be handed back. The Budget Period sheet runs its own.
  useTour("more", !deepReturn);

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
          data-tour="more.period"
          meta={
            !isDays && !isTerm
              ? "Resets on the 1st"
              : period.current
                ? isTerm
                  ? `Month ${period.current.cycle} of ${period.current.cycles}`
                  : formatPeriodLabel(period.current)
                : period.status === "lapsed"
                  ? isTerm
                    ? "Ended — set up the next one"
                    : "Ended — start the next one"
                  : "Not set up yet"
          }
          value={
            (isDays || isTerm) && period.status !== "active" ? (
              <span className="shrink-0 rounded-xs bg-surface-2 px-1.5 py-[3px] text-[11px] font-medium text-ink-2">
                Action Needed
              </span>
            ) : (
              <RowValue>
                {isTerm
                  ? "Allowance"
                  : !isDays
                    ? "Monthly"
                    : `${period.current?.days ?? 0} days`}
              </RowValue>
            )
          }
          onClick={openPeriod}
        />
        <Row
          icon={Wallet}
          title="Bank Accounts"
          data-tour="more.accounts"
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
          data-tour="more.categories"
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
          data-tour="more.recurring"
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
          data-tour="more.savings"
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
        {iconChoice && (
          <Row
            icon={Smartphone}
            title="App Icon"
            // Inside the installed app there's no telling which icon it was
            // added with, so no value is shown.
            meta={installed ? "Set when you added the app" : "Shown on your Home Screen"}
            value={
              !installed && (
                <img
                  src={homeIcon.src}
                  alt={homeIcon.name}
                  className="h-7 w-7 shrink-0 rounded-[22.5%]"
                />
              )
            }
            onClick={() => setAppIconOpen(true)}
          />
        )}
        {touchDevice && (
          <Row
            icon={Vibrate}
            title="Vibration"
            meta={vibration ? "Taps as you type and save" : "Off on this device"}
            chevron={false}
            onClick={toggleVibration}
            role="switch"
            aria-checked={vibration}
            value={<SwitchTrack checked={vibration} />}
          />
        )}
        {!["loading", "hidden"].includes(notifications.status) && (
          <Row
            icon={Bell}
            title="Notifications"
            data-tour="more.notifications"
            meta={notificationsMeta(notifications, { ...DEFAULT_HOURS, ...user?.notificationHours })}
            onClick={() => setNotificationsOpen(true)}
          />
        )}
      </Section>

      {/* Help: every page's tour, to replay, and the switch for the tips that
          turn up as you go. The switch is per account, like the tours. */}
      <Section label="Help">
        <Row
          icon={Compass}
          title="Page Tours"
          meta="A quick look at what's on each page"
          onClick={() => setToursOpen(true)}
          data-tour="more.help"
        />
        <Row
          icon={Lightbulb}
          title="Tips"
          meta={tour.off ? "Off — tours only when you ask" : "Shown as you come across things"}
          chevron={false}
          onClick={() => tour.setOff(!tour.off)}
          role="switch"
          aria-checked={!tour.off}
          value={<SwitchTrack checked={!tour.off} />}
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
          className="rounded-sm px-2.5 py-1.5 text-[13px] font-medium text-negative transition-colors duration-base ease-out hover:bg-negative/[0.08] active:bg-negative/[0.14] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-negative"
        >
          Delete Account
        </button>
        <p className="mt-4 text-[11.5px] leading-relaxed text-ink-3">
          Broke No More · Avatars by Twemoji (CC-BY 4.0)
        </p>
      </div>

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

      <ToursSheet open={toursOpen} onClose={() => setToursOpen(false)} />

      <EditProfileSheet open={editOpen} onClose={() => setEditOpen(false)} />
      <SavingsTargetSheet open={savingsOpen} onClose={() => setSavingsOpen(false)} />
      <BudgetPeriodSheet open={periodOpen} onClose={() => setPeriodOpen(false)} />
      <DeleteAccountSheet open={deleteOpen} onClose={() => setDeleteOpen(false)} />

      <NotificationsSheet
        open={notificationsOpen}
        onClose={() => setNotificationsOpen(false)}
        notifications={notifications}
        user={user}
        toast={toast}
      />

      {iconChoice && (
        <AppIconSheet
          open={appIconOpen}
          onClose={() => setAppIconOpen(false)}
          installed={installed}
        />
      )}

    </PageWrapper>
  );
}
