import { loadStreak } from "../controllers/streakController.js";
import { sendToUser } from "../lib/push.js";
import { parseYmd, ymd } from "../lib/validation.js";
import User from "../models/User.js";
import { loggedOn } from "./dailyReminder.js";
import { claim, findDue } from "./notify.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const TYPE = "morningBudget";

const money = (value) =>
  `$${Math.abs(value).toLocaleString("en-SG", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

/**
 * The morning notification for one user, from the same streak payload the
 * home screen renders, in the same words. Null when there is no budget to
 * report: no active period, or nothing to spend in it yet.
 *
 * Pure, so the wording is testable without a database.
 */
export function morningBudgetMessage(streak, { mode, loggedYesterday }) {
  if (streak.periodStatus !== "active" || !streak.hasIncome) return null;

  const noun = mode === "days" ? "period" : "month";
  const daysLeft = streak.period?.daysLeft ?? 0;
  const left = `${daysLeft} ${daysLeft === 1 ? "day" : "days"} left in this ${noun}.`;
  // The budget assumes yesterday's spending is logged. If nothing was, the
  // figure may be too generous, and this is the moment to say so.
  const nudge = loggedYesterday
    ? ""
    : " Nothing was logged yesterday; add anything you spent and this will update.";

  let title;
  if (streak.overspentBy > 0) {
    title = `${money(streak.overspentBy)} past this ${noun}'s budget`;
  } else if (!streak.today.within) {
    // Possible first thing in the morning when a repeating entry lands today.
    title = `${money(streak.today.remaining)} over today's budget`;
  } else {
    title = `${money(Math.max(streak.today.remaining, 0))} to spend today`;
  }

  return { type: TYPE, title, body: `${left}${nudge}`, url: "/", tag: "morning-budget" };
}

/**
 * Morning budget: to everyone whose local morning hour is `now`. `dryRun`
 * returns the messages without claiming or sending; `send` replaces the
 * network call in tests.
 */
export async function runMorningBudget(now = new Date(), { dryRun = false, userIds, send } = {}) {
  const { candidates, due, skipped } = await findDue(TYPE, now, { userIds });
  const summary = { candidates, due: due.length, recipients: 0, sent: 0, pruned: 0, skipped: [...skipped] };
  const messages = [];

  for (const { id, dayKey } of due) {
    // A full document: loadStreak may carry savings forward or post repeating
    // entries, exactly as opening the app would.
    const user = await User.findById(id);
    if (!user) continue;
    const yesterday = ymd(new Date(parseYmd(dayKey).getTime() - DAY_MS));
    const streak = await loadStreak(user, dayKey);
    const payload = morningBudgetMessage(streak, {
      mode: user.budgetMode,
      loggedYesterday: (await loggedOn(yesterday, [user._id])).size > 0,
    });
    if (!payload) {
      summary.skipped.push({ id, reason: "no-budget" });
      continue;
    }

    summary.recipients += 1;
    if (dryRun) {
      messages.push({ id, title: payload.title, body: payload.body });
      continue;
    }
    if (!(await claim(TYPE, id, dayKey))) continue;
    const result = await sendToUser(id, payload, { type: TYPE, send });
    summary.sent += result.sent;
    summary.pruned += result.pruned;
  }

  return dryRun ? { ...summary, dryRun: true, messages } : summary;
}
