# Prompt for Claude Code — content fixes

Copy everything below the rule. Attach `design/CONTENT_AUDIT.md` alongside it.

---

I'm fixing the copy in **Broke No More**, a mobile-first budgeting app
(React 18 + Vite + Tailwind + Vitest). I've attached a content audit run against
Andrew Tipp's 12 heuristics for content design. **Read it first** — it has the
reasoning behind each change, not just the instruction, and the reasoning is the
part that matters when you hit an edge case I didn't anticipate.

Work through its six items **in order**. They're sorted by consequence, not
effort: item 1 is the only one that can make someone misjudge their own
finances.

## Before you start

```bash
cd frontend && npm test        # should be green before you touch anything
npm run dev                    # keep it running; look at what you change
```

There are **11 test files**. Keep them green. If one breaks, read it before you
edit it — several encode real behaviour and the failure may be telling you the
change is wrong, not that the test is stale.

## The six changes, with what I already know

### 1. "Saved" means two contradictory things on Home

**`src/pages/HomePage.jsx`**

- **Line ~370** — `<StripCell label="Saved" value={stats?.periodSavings} …>`
  → relabel to **"Reserved"**. It's the savings *target*, a plan, not an
  achievement.
- **Line ~401** — the tile `label={\`Saved this ${noun}\`}` with
  `value={stats?.percentageSaved}` → becomes **"Unspent So Far"**, and must be
  **recomputed**, not just relabelled.

The whole point is in the audit: `percentageSaved` divides by **income**, while
the pace bar divides by **budget** (income − savings). Relabelling alone puts
"Unspent So Far 77%" under a bar reading 30.6% spent — they don't complement,
and anyone checking the arithmetic finds they disagree.

Derive it from the bar instead. `budget` and `spentPct` are both already
computed in this file (~line 74–79):

```js
const unspentPct = budget > 0 ? Math.round(100 - spentPct) : 0;
```

Then feed that to the tile with `suffix="%"` instead of `stats.percentageSaved`.

**Do not touch `percentageSaved` on `StatsPage.jsx` or the backend.** There it
measures completed months, where money not spent genuinely was money saved. It's
only misleading for a period still running. Leave a comment saying so, or
someone will "fix" Stats to match and break it.

*Test exposure:* `pages/HomePage.test.jsx` line ~56 sets `percentageSaved: 0` in
a fixture. Once the tile stops reading that field the fixture may be
unnecessary — check rather than assume, and don't delete a field the page still
uses elsewhere.

### 2. The overspent state names two fixes and links to neither

**`src/pages/HomePage.jsx` line ~354.** The copy reads:

> "No daily budget until more income lands — or lower this month's savings
> target."

Both are real actions, neither is tappable. Add two buttons under that block:

- **Add income** → `navigate("/transactions", { state: { openAdd: "income" } })`
  (this is the same route the app-shell add button uses; `TransactionsPage`
  already reads `openAdd` from router state)
- **Lower target** → `navigate("/more")`

Use the existing `Button` component. Ghost variant, side by side — this is a
recovery path, not a call to action, and it shouldn't outshout the figure above
it.

### 3. Error messages end two different ways

**31 `Couldn't…` strings**, spread across 15 files:

```
MorePage 7 · FriendsPage 4 · TransactionsPage 3 · AccountsSheet 3
RecurringSheet 3 · AddTransactionSheet 2 · CategoriesSheet 2
StatsPage, HomePage, PlanPage, TrackerPage, LoginPage,
StreakCard, TransferSheet, SavingsGoalCard — 1 each
```

8 end with "Please try again"; 23 don't.

Pick one rule and apply it everywhere. My suggestion, but decide for yourself
and write the decision down somewhere durable: **add the retry prompt only when
retrying is genuinely the right move.** A network or server failure, yes. A
validation failure, no — retrying identically fails identically, and telling
someone to try again when it can't work is worse than saying nothing.

Then the presence of "Please try again" carries information instead of being
decoration.

### 4. "Couldn't save that. Try again."

**`src/components/RecurringSheet.jsx` line ~161.** "That" does no work — name
the object. Something like "Couldn't save this repeating entry."

### 5. Pin the money locale

**`src/lib/utils.js`, `formatMoney`.** Currently `toLocaleString(undefined, …)`,
which follows the *reader's browser* for separators. A German-locale browser
renders `$1.240,00` — our symbol, their decimal comma. In a money app that's an
amount that reads as a different number.

The audit has the exact replacement. Pin `en-SG`, and keep the comment
explaining the assumption and where to change it when a second currency is
needed. **Currency support itself is deliberately out of scope** — SGD only, no
picker, no user field, no backend change.

*This should require no test changes:* `en-SG` groups and points exactly as the
existing assertions expect. If a test fails on strings that look identical,
suspect a non-breaking space — `Intl` uses one in some locale/currency pairs and
it's invisible in a diff.

### 6. Apple-style title case — do this LAST

**This reverses what the audit's Scannable section originally proposed.** The
audit has been updated; if you meet any stale "sentence case" wording, the rule
below wins.

The app follows Apple's HIG here, not GOV.UK. Capitalise every word **except**:

- articles — *a, an, the*
- coordinating conjunctions — *and, but, or, nor, for, yet, so*
- prepositions of **four letters or fewer** — *in, on, at, to, of, by, up*

…and **always capitalise the first and last word**, whatever they are.
Prepositions of five letters or more are capitalised (*Between, Through, About*).

**Scope matters as much as the rule.** Title case applies to page titles, card
and section headings, form labels, buttons, menu items and column headers.
**Sentence case stays** for body text, empty-state explanations, helper text,
error messages and footnotes. Title-casing an error message makes the app read
like a brochure. The test: *is it a label, or is it a sentence?*

**Scale, measured:** 63 multi-word candidates across `pages/` and `components/`.
20 are `aria-label` only and are **excluded** — screen readers don't announce
capitalisation, so it changes nothing for the people who hear them, while
breaking test queries. That leaves roughly **43 visible strings**. It's the
biggest diff on this list and the only item that moves test assertions, which is
why it's last.

The audit has a worked table for the multi-word headings with the reasoning for
each. Follow it rather than re-deriving, especially the awkward ones:

- "Day of the week" → **"Day of the Week"** (*of* lowercase, *Week* is last)
- "Spend at most" → **"Spend at Most"** (*at* lowercase, *Most* is last)
- "Starting from" → **"Starting From"** (*from* is 4 letters, but it's last)
- "Wants to add you" → **unchanged** — a sentence fragment, not a label

**"All Months" stays as it is.** Buttons convert too: "Add Your First Entry",
"See All Months", "Move Money Between Accounts", "Add a Transaction". So do the
labels item 1 creates: **"Unspent So Far"** (*so* is an adverb here, not a
conjunction, so it capitalises) and **"Reserved"**.

**Do not** title-case:

- `.overline` labels (Left to spend, In, Out, Reserved) — CSS uppercases them via
  `text-transform`, so the source casing never renders
- `aria-label` and other accessible-name-only strings — inaudible to their
  audience, and 51 test queries use `getByRole(…, { name })`

*Test exposure:* tests query by accessible name, e.g.
`getByRole("button", { name: "Add expense" })` in `TransactionsPage.test.jsx` and
`getByRole("dialog", { name: "New entry" })`. Renaming a visible button or dialog
title breaks those. Update the assertion to the new string; **don't** loosen the
matcher to a regex, or the test stops pinning anything.

**Verify when done:** `npm test` green, then read every screen in the browser and
check nothing reads like a brochure. If a *sentence* got capitalised, the rule
was applied past its boundary.

## How to work

- **One item at a time.** Show me the diff and the test result before moving on.
  Don't batch all six and hand me a wall of changes.
- **Run `npm test` after each.** Report the count; it should never go down.
- **Look at Home in the browser after items 1 and 2** — they change what's on
  screen, not just the words.
- **Keep the existing comments.** This codebase explains *why* unusually well.
  If you change something a comment describes, update the comment; don't strip
  it.
- Preserve accessibility: `focus-visible` rings, `aria-*`, and
  `prefers-reduced-motion` support all stay.
- Copy style: **Apple-style title case for visible labels, titles, headings and
  buttons; sentence case for body, errors and descriptions** (see item 6).
  Active voice, short sentences, no jargon. British or American spelling — match
  whatever the file already uses.

Start with item 1 and show me the Home diff before going further.
