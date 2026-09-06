# Content audit — Broke No More

Evaluated against **Andrew Tipp's 12 heuristics for content design**
([UX Planet, July 2025](https://uxplanet.org/12-heuristics-for-content-design-f6d7ec989cb5)).

They're alphabetical by design, so accessibility isn't last-and-least. Each has
testable criteria — which is the point, and what Tipp says earlier frameworks
lacked.

| # | Heuristic | In one line |
|---|---|---|
| 1 | **Accessible** | Perceivable, understandable and usable for disabled people |
| 2 | **Accurate** | Correct, and regularly reviewed |
| 3 | **Concise** | The fewest words practically possible |
| 4 | **Consistent** | Follows the same style and patterns throughout |
| 5 | **Discoverable** | Findable however people choose to arrive |
| 6 | **Ethical** | User needs above organisation goals |
| 7 | **Inclusive** | Designed for everyone, reflects real diversity |
| 8 | **Prioritised** | Most important first, details revealed gradually |
| 9 | **Readable** | Plain language, short sentences, active voice |
| 10 | **Scannable** | Understandable without reading all of it |
| 11 | **Specific** | Precise; no jargon, ambiguity or assumptions |
| 12 | **Useful** | Helps someone find information or finish a task |

**Caveat:** this framework was written for public-sector web content. Two of the
twelve barely apply to an authenticated mobile app — **Discoverable** is mostly
SEO, and **Accurate**'s criteria are about sign-off processes. Judged on the ten
that do apply.

---

## Findings, worst first

### ❌ Ethical — "Saved this month: 77%" flatters the user about their own money

The single worst content problem in the app, and it's an *ethical* one before
it's an accuracy one.

`percentageSaved` is `(income − expenses) / income`. On day 2 of a month that
reads ~97%. It isn't money saved — it's money **not yet spent**, most of which
is earmarked for the remaining 28 days. A savings app congratulating you for
being early in the month is a soft dark pattern: the number reliably overstates
how well you're doing, and it overstates most when you have the least
information.

Tipp's Ethical criterion is "does the content avoid dark patterns?" This doesn't
clear it.

**Fix (decided): rename to "Unspent So Far" — but recompute it, don't just
relabel it.** The tile earns its place: the pace bar shows what's been *spent*,
so without it the reader has to subtract from 100 in their head.

The trap is the denominator. They don't match:

| | Denominator | Value |
|---|---|---|
| Pace bar | budget (income − savings) | 30.6% spent |
| `percentageSaved` | income | 77% |

Relabelling alone ships the same bug in new clothing: "Unspent So Far 77%" under
a bar reading 30.6% doesn't complement it, and anyone checking `100 − 30.6 = 69`
finds they disagree.

So derive it from the bar: `unspentPct = 100 − spentPct`, using `budget` and
`spent` which are already computed in `HomePage.jsx`. No backend change, and it
can't drift from the bar because it comes from it.

**Leave `percentageSaved` alone on Stats.** There it measures completed months,
where money not spent really was money saved. It's only misleading for a period
still running. Worth a comment so nobody "fixes" Stats to match.

### ❌ Specific + Accurate — "Saved" means two contradictory things on one screen

- Strip cell **"Saved"** → `periodSavings` = $300.00, the savings **target**
- Tile **"Saved this month"** → `percentageSaved` = 77%, an **outcome**

$300 of $1,240 is 24%. Same word, two figures, off by 3×.

**Fix:** the strip cell becomes **"Reserved"** (it's a plan, not an achievement).
Combined with the fix above, "saved" then appears exactly once in the app and
means one thing.

### ⚠️ Consistent — error messages end two different ways

31 `Couldn't…` strings. **8 end with "Please try again"; 23 don't.** Same class
of event, two registers:

```
"Couldn't send request. Please try again."
"Couldn't update profile."
```

**Fix:** pick one rule and apply it. Suggested: add the recovery step only when
retrying is actually the right move — a network blip, yes; a validation failure,
no, because retrying identically will fail identically. Then the presence of
"Please try again" carries information instead of being noise.

### ⚠️ Specific — "Couldn't save that. Try again."

"That" is doing no work. Which thing? Tipp's criterion is "has ambiguity been
avoided — is it clear who *we* are, what *that* is?"

**Fix:** name the object. "Couldn't save your savings target."

### ⚠️ Useful — errors say what broke, never what to do

Almost every message is a dead end. The strongest example is the overspent
state, which names two remedies and links to neither:

> "No daily budget until more income lands — or lower this month's savings
> target."

Both are real actions. Neither is tappable. Tipp's Useful criterion: "is the
next step in the user's journey clear?"

**Fix:** two buttons — *Add income* → the add sheet, *Lower target* → More →
Savings target.

### 🔁 Scannable — reversed: title case, Apple-style

**Original finding was "All Months" is the app's only Title Case string, make it
sentence case." Overruled, and correctly.**

I cited GOV.UK and NN/g, both sentence-case houses. But **Apple's HIG specifies
title-style capitalisation** for navigation titles, buttons, menu items, labels
and section headers — look at iOS Settings: "Screen Time", "Do Not Disturb",
"Face ID & Passcode". This app is deliberately in the Apple register (iOS easing
curves, bottom sheets, tab bar), so following Apple here is coherent. Convention
versus convention, not preference versus best practice.

The count runs the other way from what the original finding implied. Measured
across `pages/` and `components/`:

- **63** multi-word strings are title-case candidates
- **20** of those are `aria-label` only — invisible, and excluded (see below)
- so roughly **43 visible strings change**
- **51** test queries use `getByRole(…, { name })`, some of which will move

So this was never "leave one string alone". It's the largest item on the list by
edit count and the only one that touches the test suite. Decision taken knowing
that — but it's why this should be done **last**, after the two items that change
what someone believes about their own money.

#### The rule

Capitalise every word **except**:

- articles — *a, an, the*
- coordinating conjunctions — *and, but, or, nor, for, yet, so*
- prepositions of **four letters or fewer** — *in, on, at, to, of, by, for, up*

…and **always capitalise the first and last word**, whatever they are.

Prepositions of five letters or more are capitalised: *Between, Through, Without,
About*.

#### Where it applies — and where it doesn't

| Title case | Sentence case |
|---|---|
| Page titles (`h1`) | Body text and descriptions |
| Card and section headings | Empty-state explanations |
| Form labels | Helper and hint text |
| Buttons and menu items | Error messages and toasts |
| Table column headers | Footnotes |

**Also excluded: `aria-label` and other accessible-name-only strings.** Screen
readers don't announce capitalisation, so title-casing them changes nothing for
the people who hear them — while breaking `getByRole(…, { name })` queries in the
tests. Twenty of the sixty-three candidates are this kind. Leave them.

**Also excluded: `.overline` labels** (Left to spend, In, Out, Reserved). CSS
uppercases them via `text-transform`, so the source casing never renders.

This split is Apple's too, and it's the half people forget. Title-casing an error
message or a paragraph makes an app read like a brochure. **When in doubt: is it
a label, or is it a sentence?** Labels get title case; sentences don't.

#### The visible-heading conversions, worked

These sixteen are the multi-word *headings and labels rendered as element text*.
Buttons, card titles and column headers follow the same rule — apply it, don't
re-derive it.

| Now | Becomes | Why |
|---|---|---|
| Account activity | **Account Activity** | |
| Account name | **Account Name** | |
| Add one | **Add One** | last word always caps |
| Budget that day | **Budget That Day** | *that* is a determiner, not an article |
| Daily spending | **Daily Spending** | |
| Day of the week | **Day of the Week** | *of* ≤4, *the* article, *Week* is last |
| How often | **How Often** | |
| Length in days | **Length in Days** | *in* ≤4 |
| No budget period running | **No Budget Period Running** | |
| Nothing to track yet | **Nothing to Track Yet** | *to* ≤4 |
| Running now | **Running Now** | |
| Spend at most | **Spend at Most** | *at* ≤4, *Most* is last |
| Start a spending streak | **Start a Spending Streak** | *a* article |
| Start date | **Start Date** | |
| Starting from | **Starting From** | *from* is ≤4 **but last**, so caps |
| Wants to add you | *unchanged* | a sentence fragment, not a label |

Buttons follow the same rule: "Add Your First Entry", "See All Months",
"Move Money Between Accounts" (*between* is 7 letters → caps), "Add a Transaction".

**"All Months" stays as it is** — it was right all along.

### ⏸️ Inclusive — currency: deferred, but one real bug to fix now

**Deferred by decision: SGD only, shown as `$`, no currency picker.** Correct
call — a settings row, a user field and a backend migration to support one
currency is work with no reader on the other end.

That drops this finding to almost nothing, and it's worth being honest that it
does: for SGD displayed as `$`, the current `formatMoney` already emits exactly
the right string. Swapping in `Intl.NumberFormat` with `currencyDisplay:
"narrowSymbol"` produces the identical output. There is no user-visible win
today.

**But one genuine bug survives, and it isn't about which currency you chose:**

```js
Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: 2, ... })
```

`undefined` means "use the runtime's locale" — which governs the *separators*,
not the symbol. On a German or French browser that renders **`$1.240,00`**: our
dollar sign, their decimal comma. In a money app that's an amount which reads as
a different number. It has nothing to do with internationalising the app; it's a
formatting bug that happens to be exposed by the reader's machine.

**Fix — pin the locale, name the assumption:**

```js
// SGD only for now, formatted the Singapore way. The locale is pinned rather
// than left to the runtime: `toLocaleString(undefined, …)` follows the reader's
// browser for separators, so a de-DE machine would render "$1.240,00" — our
// symbol, their decimal comma.
//
// When a second currency is needed, this is the one place to change: swap the
// body for Intl.NumberFormat with { style: "currency", currency,
// currencyDisplay: "narrowSymbol" } and thread a stored ISO 4217 code through.
const LOCALE = "en-SG";

export function formatMoney(value, currency = "$") {
  const n = Number(value) || 0;
  return `${n < 0 ? "-" : ""}${currency}${Math.abs(n).toLocaleString(LOCALE, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}
```

No test changes: `en-SG` groups and points exactly as the assertions already
expect.

### ⚠️ Specific — undefined domain vocabulary

"Budget period", "streak", "restore", "reserved" are all app-specific terms used
without ever being defined. Tipp: "treat every piece of content as the first
time the user has met that subject."

"Restore" is the sharpest — it's a game mechanic that spends a finite resource
to repair a broken streak, explained nowhere except inside the confirmation
sheet you only reach by tapping it.

**Fix:** one-line definitions where each first appears. The empty state and the
More rows are the natural homes.

---

## What's already good

- **Readable** — genuinely strong. Short sentences, active voice, common words.
  "Know exactly how much you can spend today." No jargon in the marketing copy.
- **Accessible** — the palette was verified against WCAG AA at every ink and
  semantic pair on all three surfaces; `ink-3` was deliberately darkened from a
  prettier `#9B9FA3` (2.66:1, fails) to `#6B6F74` (5.1:1). Focus rings and
  `prefers-reduced-motion` are intact.
- **Prioritised** — the redesign is built on this: one hero figure, progressive
  disclosure, secondary metrics demoted to a hairline strip.
- **Concise** — microcopy is tight throughout. "Minus $200.00 for savings,
  that's $152.00 left to spend" replaced three reconciliation rows.
- **Consistent** (visual) — one token system, one card recipe, one green.

---

## Suggested order of work

1. Rename `Saved` → `Reserved`, and `Saved this month` → `Unspent So Far`,
   **recomputed as `100 − spentPct`** so it complements the pace bar rather than
   contradicting it — **the only item here that can mislead someone about their
   own finances**
2. Add the two action buttons to the overspent state
3. Settle one error-message convention and apply it to all 31
4. Define "restore" and "budget period" where they first appear
5. Pin the money locale to `en-SG` (one line — stops a non-English browser
   rendering `$1.240,00`). Full currency support stays deferred.
6. **Last:** apply Apple-style title case to visible labels, titles, headings and
   buttons — ~43 strings, table above. Body text, errors, descriptions,
   `aria-label`s and `.overline`s all stay as they are. "All Months" stays as it
   is. Left until last because it's the biggest diff and the only item that
   moves test queries.

---

**Source:** Andrew Tipp, *12 heuristics for content design*, UX Planet, 29 July
2025 — <https://uxplanet.org/12-heuristics-for-content-design-f6d7ec989cb5>

Builds on: [Lauren Pope's heuristic framework for
content](https://lapope.com/2024/07/04/a-heuristic-framework-for-content-aka-principles-for-impactful-content/),
[Jas Deogan's 10 heuristics of content
design](https://uxplanet.org/the-10-heuristics-of-content-design-unleashing-its-power-367a5da78e2a),
[Bobbie Wood's UX writing
checklist](https://www.linkedin.com/pulse/ux-writing-checklist-content-heuristics-designers-bobbie-wood/).
Grounded in the [ISO standard for plain
language](https://www.iso.org/standard/78907.html): information must be
relevant, findable, understandable and usable.
