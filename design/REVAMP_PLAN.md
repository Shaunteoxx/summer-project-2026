# Frontend revamp

**Direction:** quiet premium (Copilot Money / Apple Wallet register)
**Scope:** full visual rewrite, existing navigation / page structure / features unchanged
**Revision:** 3 — decisions settled, spec separated from the record

**Artefacts**

| File | What it is |
|---|---|
| `design/mockups.html` | **The spec.** 29 frames, every screen in its shipping state. No alternatives. |
| `design/REVAMP_PLAN.md` | This file — audit, decisions, build order. |

Two working files were removed once the build shipped: `decisions.html` (the archive
of rejected options — the calls that mattered are recorded in §0 below) and
`tokens.css` (a drop-in for the `:root` / `.dark` blocks, now superseded by the
live values in `src/index.css`, which is the single source of truth for tokens).

`mockups.html` is the spec: where it and this file disagree, the mockups win.

---

## 0. Decisions from review

**Naming.** "Ledger" reverted to **Transactions**. **Calculator → Plan**, since four live
planners is what the page actually is, and the app's real keypad lives in the add sheet. The
first planner is labelled **Dynamic daily budget**, matching what it does.

**Keep the three-way split.** Transactions / Tracker / Stats answer three different questions
— *what happened* (a list), *am I OK right now* (this period, charted), *am I getting better*
(all time, by month). Collapsing any pair forces a mode switch that costs more than the page
it saves. What was actually wrong is that the split wasn't self-evident, so: every page now
states its span in the subtitle ("1–31 August · this period" vs "Every month you've
tracked"), and the **All months** button is back at the top *and* bottom of Tracker so the
period → history hand-off is a visible path rather than something buried in More.

**No `+` in the tab bar — use a FAB.** A tab bar is a set of places; every slot navigates and
holds an active state. A `+` opens a modal and can never look "current", so one imposter in
five slots costs more than it gains. It also spends a destination — Plan would get evicted
into More, which already holds Stats, Friends, Repeating entries, Budget period and Profile.
And the bottom-*right* is the better thumb zone on a 390-wide phone than dead centre. The FAB
is 54px against a ~44px tab, sits in that better zone, costs no destination, and can hide
itself on Plan and More. Counter-argument, honestly: this is a manual tracker with no bank
sync, so logging really is the daily job and the centre slot is the most prominent place on
screen. Both are rendered in the mockups (section 04) — the call is yours.

**Hero: greeting left, figure centred.** Settled on this after seeing all three rendered
(mockups section 01b). Three zones, each internally consistent: a left-aligned header
(greeting + full date), a centred figure (overline + amount), and a full-width meter (pace bar
+ caption, with the caption's two ends anchored to the bar's two ends so it reads as part of
the bar rather than as loose text).

I argued against this first and was wrong to. The objection was "four competing alignments",
but the bar and its caption are one full-width component, not two stray alignments — and a
centred figure above a full-width track is a normal, legible arrangement. The version I'd have
rejected on principle is the fully-centred block (01b C), which shrinks the bar to ~190px; the
fill-vs-tick gap is the signal you actually read there, and it stops being legible when the
meter is short. Centring the figure costs nothing; centring the meter costs the meter.

Applied to Home in all three states and to Plan's daily-budget figure. Page titles on
Transactions / Tracker / Stats stay left — they're titles, not heroes.

**Accounts: split the net into In / Out columns.** The card is retitled **Account activity** and
shows two figures per account instead of one net.

The original problem was never the label — it was that **net movement per account answers no
question anyone has**. "DBS +$1,175.20" isn't a balance, isn't spending, and isn't actionable.
Because that number needed explaining, the card carried three extra rows (Total → Reserved →
Left to spend) purely to prove it agreed with a figure already at the top of the same screen,
plus a footnote walking back what "In your accounts" implies. Six rows and a disclaimer for one
insight.

Splitting the net back into the two numbers it was made from fixes it at the source: "$1,240 in,
$64.80 out" needs no interpretation, and nothing on the card resembles a balance, so the
disclaimer disappears on its own. The reconciliation survives as one sentence —
*"Less $300.00 reserved for savings, that's your $652.60 left to spend"* — instead of three rows.

Layout: name / In / Out, right-aligned tabular columns, a Total row on a hairline, then the
reconciliation sentence. Accounts with no income show an em-dash in ink-3 rather than `$0.00`,
so the column stays scannable. Appears in the overspent state too, where it matters more, not
less — it's what shows which account the damage came out of; there the closing sentence reads
*"…you're $86.40 past this month's budget."*

Rejected alternative worth recording: a "Spending from" stacked bar (mockups 01c C). Better at a
glance, but it drops the reconciliation and its layout assumes income lands in one account. If
the glance turns out to matter in use, the bar is **additive** — it can sit above B's table later
without disturbing it.

**Quick actions replaced by Recent.** Three of the four went to tabs already one tap away.
Recent shows the last four entries, because "what did I just spend" is the actual reason
people open a manual tracker.

**Category palette: fixed lightness, per-hue chroma.** My first version fixed *both* lightness
and chroma, which was a mistake — teal at 190° tops out at chroma 0.104 in sRGB, so that one
hue capped all eight and the palette came out dusty. Red was running at 0.095 when it could
carry 0.235. Lightness is what the eye reads as "same family"; chroma variation is far less
visible. So lightness is locked at `.620` light / `.775` dark and each hue takes
`min(0.14, its own gamut ceiling)`. Two hues also moved out of the drab yellow-green stretch:
ochre 75°→68°, olive 115°→132°. Every swatch clears 3:1 against its surface, so a 9px dot
stays legible.

**Avatars: Twemoji stays, set curated.** The line-glyph alternatives were more coherent and
duller; avatars are the one place in this app where warmth beats system purity. Two fixes that
aren't about style: the set becomes **all animals** — pumpkin, snowman and teddy bear out; fox,
rabbit, penguin, owl, whale, koala and tiger in, taking it 9 → 14. And the **no-avatar fallback
becomes a monogram** on a hue derived from the username, rather than a generic silhouette, so
the Friends list never shows two identical strangers. Needs `public/avatars/` extending and
`lib/avatars.js` updating.

---

## 1. What's actually wrong

Nothing here is broken. The app is well built — the animations are considered, the empty
states exist, `prefers-reduced-motion` is handled, focus rings are real. The problem is
that the design makes **every element shout at the same volume**, which is the specific
failure mode of a stock shadcn theme with a brand hue swapped in.

Twelve concrete issues, in rough order of how much they cost you:

**1. Green is doing decoration duty.**
Emerald is the background wash, the hero gradient, the card borders on stat tiles, the icon
chips, the active tab pill, the streak flame, the close-button ring, and the "in" figure.
When a colour means *brand*, it can't also mean *money*. So the one place green should be
unmistakable — income arriving — carries no signal at all.

**2. Red means "expense", when it should mean "problem".**
Every expense row is `text-destructive`. The calculator sheet is a red-tinted display in a
red border above a red confirm button. Spending money is the normal case in a spending
tracker; painting it as an error trains the user to ignore red, which is exactly the colour
you need working when they actually go over budget.

**3. Weight is substituting for hierarchy.**
`font-extrabold` on the page title, the hero, the stat values, and the brand. When
everything is 800, nothing is emphasised — the eye has no entry point. Premium finance UI
does this with *size*: a 46px number at weight 500 reads as far more important than a 28px
number at weight 800, and looks calmer doing it.

**4. Cards carry a border AND a shadow AND a tint.**
`rounded-xl border bg-card shadow-sm`, plus `border-primary/30 bg-gradient-to-br
from-primary/15` on the hero and `blur-3xl` glow blobs on top. Three depth cues stacked.
Pick one.

**5. `--radius: 1rem` is applied uniformly.**
That resolves to 20px for `rounded-xl`, which is right for a card and wrong for a 36px icon
square, an 11px badge, or a 9px chip. Uniform large radius is the single strongest "this is
a template" signal.

**6. The background gradient fights the content.**
`.app-bg` paints two 1100×540 fixed radial emerald glows behind everything. Because it's
`background-attachment: fixed`, cards slide over a stationary wash as you scroll, and pure
white cards pick up a green cast at the edges.

**7. Numerals aren't tabular.**
`tabular-nums` is applied in four places by hand. Everywhere else — the ledger amounts, the
account tiles, the stats table — digits are proportional, so a column of amounts visibly
drifts as values change. This is the cheapest possible credibility win in a money app and
it's currently unclaimed.

**8. Motion is over-eager for a daily-use tool.**
Every `Button` does `whileHover={{scale:1.03, y:-1}}` and `whileTap={{scale:0.97}}` on a
400-stiffness spring. Pages slide 24px. List items slide in 24px horizontally. Stat cards
scale from 0.92. Opened six times a day, this reads as fussy rather than polished.

**9. Light and dark are different products.**
Light is green-cast (`--background: 150 30% 98%`). Dark is blue-cast slate
(`--background: 222 32% 7%`, `--card: 222 26% 11%`). Switching themes doesn't feel like
dimming the lights, it feels like changing apps.

**10. Category colours don't form a scale.**
Terracotta, cornflower, lilac, gold, sea-green — individually muted, collectively arbitrary.
In a donut they read as a paint spill because their lightness and chroma vary.

**11. `--muted-foreground` at 40% L is the only usable secondary.**
There's no third ink level, so labels, meta text and disabled states all share one grey and
sections have no internal hierarchy.

**12. Spacing has no rhythm.**
`mt-5 / mt-4 / mt-4 / mt-4 / mt-8`, `p-6` next to `p-4`, `gap-3` next to `gap-2`. Nothing is
wrong individually; there's just no system, so the page never settles.

---

## 2. What the research says

The consistent finding across the current fintech design literature, and across the apps
that are actually praised for their interfaces:

- **Big numbers, quiet everything else.** Bold, oversized type on balances and totals,
  with a neutral palette everywhere else so the figure is the only thing competing for
  attention. ([One Thing Design][1], [Fuselab][2])
- **Neutral is the direction of travel.** "Friendly corporate blue" and heavy brand
  saturation are on the way out; high-contrast neutral palettes, minimal borders and
  restrained shadows are what reads as current. ([Skins Factory][3])
- **Tabular lining figures are the gold standard for financial UI.** `font-variant-numeric:
  lining-nums tabular-nums` so `$1,111.00` and `$8,888.00` occupy identical width and
  decimals align down a column. Misaligned decimals measurably undermine trust.
  ([Nick Designer, *The elements of fintech typography*][4], [Type Network][5])
- **Card count is the usual dashboard failure.** Users can hold about seven elements at a
  glance; the standard advice is to give secondary metrics less weight rather than an equal
  card. Today's Home has nine card-weight elements. ([UXPin][6], [Databox][7])
- **Copilot Money's advantage is systematisation, not flair.** Their design lead's writeup
  describes the win as building a real design system — 30+ components, 50+ icons, two
  themes, two platform variants — after years of ad-hoc UI. The polish is a downstream
  effect of consistency. ([Matt Ström-Awn][8])
- **Over-designing loses.** Gradients, glassmorphism and over-animated transitions are
  named repeatedly as what makes budgeting apps feel cluttered rather than premium.
  ([UXPin][6], [Eleken][9])

---

## 3. The system

Full token set lives in **`src/index.css`**, rendered in **`design/mockups.html`**.

### Colour discipline — three rules

| Colour | Means | Never used for |
|---|---|---|
| **Green** `#0F7A56` / `#45D19C` | Money in, money kept, on track | Brand, backgrounds, borders, nav, icons |
| **Red** `#B4342A` / `#E9635A` | Over budget. That's it. | Ordinary expenses |
| **Ink** 3 levels | Everything else, including expense amounts | — |

Expense amounts become **ink, not red**, with a `−` sign. Income is green with a `+`.
This one change does more for the app's maturity than the entire type scale.

### Surfaces

Flat warm canvas, no gradient. A three-step surface ramp plus a hairline replaces the
border-plus-shadow-plus-tint stack. Shadow exists on exactly two things: bottom sheets and
the FAB.

```
light   canvas #FBFBF9   surface #FFFFFF   surface-2 #F3F3F0   hairline #E7E7E2
dark    canvas #0A0A0B   surface #141416   surface-2 #1D1D20   hairline #232326
```

Dark mode is true-neutral, same product at a lower brightness — not blue slate.

### Ink ramp — and a deliberate compromise

```
light   ink #17181A (17.8:1)   ink-2 #55595E (7.1:1)   ink-3 #6B6F74 (5.1:1)
dark    ink #F4F4F3 (16.7:1)   ink-2 #ABACB0 (8.1:1)   ink-3 #8A8B90 (5.4:1)
```

These are darker than a typical quiet-premium grey ramp, on purpose. My first pass used
`#9B9FA3` for `ink-3` because it looks better — it measures **2.66:1 on white and fails
WCAG AA outright**. `ink-3` carries dates, categories and account names at 12.5px, which is
body copy and owes 4.5:1. Worst case in the shipped ramp (`ink-3` on `surface-2`) is
**4.55:1**. Every ink and semantic pair was checked against all three surfaces.

The cost: `ink-2` and `ink-3` sit closer together than they would in a purely aesthetic
system. Worth it.

### Typography

**Geist** (Google Fonts, free, variable) replaces Inter, with **Geist Mono** on the keypad
and expression line. Geist is a Swiss-grotesque with tighter default tracking and better
lining figures at display sizes — it's the closest free face to what the Copilot-class apps
get from SF Pro.

| Role | Size / weight / tracking | Used for |
|---|---|---|
| display | 46 / 500 / −.035em | Hero amount only |
| title-lg | 27 / 600 / −.025em | Page titles |
| title | 19 / 600 / −.02em | Card + sheet titles |
| amount | 19 / 500 / −.02em | Secondary figures |
| body | 15 / 400 (rows 500) | Everything |
| meta | 12.5 / 400, ink-3 | Dates, categories, accounts |
| overline | 11 / 500 / +.07em caps | Section labels |

Nothing above 600. `font-variant-numeric: lining-nums tabular-nums` on `body`, `input` and
`button` so it's impossible to forget.

### Radius, spacing, elevation, motion

```
radius   10 chips/tiles · 12 buttons/inputs · 16 cards · 24 sheet tops
spacing  4 8 12 16 20 24 32 48   gutter 20   section gap 26–32   card pad 18–20   row 56
shadow   card: none (hairline only) · float: sheets + FAB only
motion   120 micro · 180 base · 260 enter · 340 sheet
         ease cubic-bezier(.32,.72,0,1)
         pages: opacity + 6px  ·  lists: opacity only, 24ms stagger, first 6 items
         buttons: no hover transform, tap opacity .7
```

### Charts

No gridlines, one baseline. Donut stroke 12–13px with round caps. Bars 4px top radius.
Axis labels 10.5px ink-3.

The category palette is generated in **OKLCH** at fixed lightness and chroma
(`oklch(.615 .095 h)` light, `oklch(.775 .100 h)` dark) rather than picked by eye. This
matters: HSL lightness is not perceptual, so the current palette *looks* uneven despite
similar HSL numbers. Measured against white, the old eight range **2.33–3.65 (spread 1.31)**
— the new eight range **3.57–3.90 (spread 0.33)**, four times tighter. That's what makes a
donut read as one family rather than a paint spill.

Hues 150–185 are deliberately skipped — that band belongs to `--positive`, and a teal
category sitting directly under the saved/spent donut would read as a status colour.

```
#B66F5D food · #A67C3E transport · #838B45 shopping · #289694 entertainment
#4A8CB8 travel · #7F7CBC allowance · #9E72A8 job · #B26C87 gifts
```

---

## 4. Screen by screen

Content, sections and features are unchanged throughout — only presentation moves.

**Home.** The hero stops being a card. `$652.60` sits bare on the canvas at 46px/500, left, with
an overline above it — the unambiguous entry point instead of one of nine boxes. The greeting
carries the **full date**: "11 August 2026 · 20 days left". Under the number, a 4px pace bar:
the fill is budget consumed, the tick is where you'd be if you spent evenly. Ahead of the tick
is trouble, behind it is fine — and the app already has both numbers. In / Out / Saved become a
three-column hairline strip. Streak folds into the daily-budget card. **Accounts** are a full
summing table, no horizontal scroll, ending in Left to spend. **Recent** replaces Quick actions.

**Transactions.** Grouped by day with a day header and a day subtotal, rows on hairlines rather
than in individual cards. Category colour lives in a 34px tinted tile — present but quiet.
Amounts in ink, income in green, transfers in ink-3 and explicitly labelled *doesn't touch your
budget*. Repeating entries get a small loop glyph beside the description instead of a coloured
badge. FAB bottom-right.

**Tracker.** **All months** button top-right of the header and again as a full-width button at
the foot. Donut at 13px stroke, round caps, the percentage centred at 25px/500. Legend becomes a
value list rather than floating labels. The calendar drops its per-cell borders for tinted
fills; today is a solid ink cell; future days in the period are dashed outlines. Category donut
sits beside a right-aligned tabular value list.

**Stats.** The four headline figures stop being four cards and become a four-row table with
hairlines — which is what they are. The grouped bar chart loses its gridlines and keeps a single
baseline; the current month's label goes ink/600 while the rest stay ink-3. The **day-by-day
calendar is back**, paged a month at a time with chevrons and a per-month summary line, plus a
footnote that only the calendar is windowed to 12 months while the totals cover everything.
No "Best month" card.

**Plan** (was Calculator). Four planners, each its own card, all driven by the real period
numbers: **Dynamic daily budget** as a bare 40px figure at the top, then *What if I buy…*,
*Pace & forecast* (reusing the same pace bar as Home, so the two pages agree visually), and
*Goal ↔ daily cap* as a two-field converter with a swap glyph between them.

**Add transaction / keypad.** The amount is the hero of the sheet, centred at 44px with the sign
on the number. Category is a 6-up icon grid: five built-ins plus a dashed **+ New** tile that
opens the create panel inline — name field, six colour swatches drawn from the gaps in the
built-in hue wheel, Cancel / Create — without ever leaving the sheet. Keypad keys are 58px on
`surface-2`, operators on `surface-3`, `=` in ink, all in Geist Mono. No red anywhere — the
confirm button is ink.

**Empty and loading.** Empty states get a 52px icon tile, a 17px/600 line, one sentence, one
action. Skeletons become `surface-2` blocks at the true height of the content they replace.

---

## 5. Implementation sequence

Bottom-up, so nothing needs redoing. Roughly 9–12 files of real work; the rest is find and
replace against the new tokens.

1. **`index.html`** — swap the Inter preconnect for Geist + Geist Mono.
2. **`src/index.css`** — replace `:root` / `.dark` with the new token set. Delete
   `.app-bg` entirely. Add `.num`, `.num-display`, `.card`, `.well`, `.overline`.
3. **`tailwind.config.js`** — map the new tokens, add the stepped radius scale, set
   `fontFamily.sans` to Geist and `fontFamily.mono` to Geist Mono, add the category colours.
4. **`components/ui/{card,button,input,label,skeleton}.jsx`** — new recipes; strip the hover
   spring from `Button`.
5. **`animations/variants.js`** — retune to the durations above.
6. **`lib/categories.js`** — new eight-hue palette; `useChartColors.js` reads the new tokens.
7. **`Navbar` / `BottomNav`** — nav active state becomes ink, not green. This is what
   enforces "green means money" everywhere else.
8. **`BottomSheet`** — 24px top radius, `--shadow-float`, quieter handle.
9. **Copy + routing rename** — `Calculator` → `Plan` across `BottomNav`, the route, the page
   title and the README. Keep the `/calculator` path and redirect, or change both; either is
   fine, just don't leave the label and the URL disagreeing.
10. **New in this revision, so budget for them:** the accounts summing table (mostly a restyle
    of the existing `AccountsCard`, which already computes every row), the Recent block on Home
    (a `fetchTransactions` slice of 4), the All-months button on Tracker, the Stats day-by-day
    calendar (reuse `SpendingCalendar` with the 12-month window it already supports), and the
    `+ New` category tile wired to the existing `addCategory` in `useCategories`.
11. Pages in order: **Home → Transactions → Tracker → Stats → Plan → More → Friends → Login**.
12. Re-run `npm run shots` and diff `.shots/` against the mockups.
13. `npm test` — the Vitest suites assert on text and roles, not classes, so most should pass
    untouched. The exceptions to expect: anything asserting the string "Calculator", and
    `StatsPage.test.jsx` if it asserts on the Best-month card.

---

## 6. Deliberately not doing (my opinion, for later)

You chose "same structure", so these are **not** in the plan. Two from revision 1 have since
been adopted (Recent on Home, Calculator → Plan); what's left:

- **More is a junk drawer.** Stats, Friends, Repeating entries, Budget period and Profile all
  live behind one tab. Stats in particular is a first-class destination reached through a
  secondary menu — the All-months buttons on Tracker paper over this rather than fix it.
- **Streak restores are buried.** "2 restores left this month" is a game mechanic with real
  stakes, sitting as a 12.5px footnote. It either deserves its own affordance or it doesn't
  need the number.
- **The overspent state is a dead end.** It tells you you're $86.40 past and names two fixes
  (log income, lower the target) but links to neither. Two buttons would close that loop.

---

## 7. Risks

- **Geist changes metrics.** It runs slightly wider than Inter at the same size. Worth
  eyeballing the longest strings — `formatPeriodLabel` output, custom category names, the
  overspend warning copy — at 375px before calling it done.
- **`color-mix()`** is used for category tints in the mockups. Baseline-available in all
  current browsers, but if you support older Safari, precompute the tints instead.
- **The pace tick is new UI**, not just a restyle. It's derived from data you already have
  (`daysLeft`, period length, `periodExpenses`), so it's cheap — but say the word if you'd
  rather ship the plain bar first.
- **The pace tick needs a rule for custom periods.** In days-mode a period can start
  mid-month, so "fraction elapsed" has to come from the period's own start/end, not the
  calendar month. `lib/period.js` already resolves both, so it's a wiring question, not a
  maths one — but get it wrong and the tick silently lies.
- **Accounts table height.** It's a fixed table now rather than a scroller, so a user with
  eight accounts gets a tall card. Worth capping at ~6 rows with a "Show all" toggle before
  this ships to anyone but you.
- **Nav active state going from green to ink** is the change most likely to feel wrong for a
  day. It's what buys green its meaning back; I'd hold it for a week before judging.

---

[1]: https://www.onething.design/post/top-10-fintech-ux-design-practices-2026
[2]: https://fuselabcreative.com/fintech-ux-design-guide-2026-user-experience/
[3]: https://www.theskinsfactory.com/uiux-design-blog/fintech-ui-ux-design
[4]: https://medium.com/design-bootcamp/the-elements-of-fintech-typography-part-1-readable-money-b6c1226acbde
[5]: https://typenetwork.com/articles/opentype-at-work-figure-styles
[6]: https://www.uxpin.com/studio/blog/dashboard-design-principles/
[7]: https://databox.com/bad-dashboard-examples
[8]: https://mattstromawn.com/projects/copilotmoney/
[9]: https://www.eleken.co/blog-posts/budget-app-design
