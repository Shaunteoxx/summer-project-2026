# Copy conventions — Broke No More

Decisions taken while working through `CONTENT_AUDIT.md`. Written down so the
next person changing a string doesn't have to re-derive them, and so a reviewer
can tell a deliberate choice from a slip.

## Error messages: when to say "Please try again"

**The rule: toasts carry the retry line, inline form errors don't.**

There were 32 `Couldn't…` strings and two registers — 10 ended with a retry
prompt, 22 didn't, for the same class of event. The split is now by *where the
message appears*, because that determines whether retrying is a next step the
reader still has in front of them.

| Where | Retry line | Why |
|---|---|---|
| `toast.error(…)` | **Yes** — "Please try again." | The toast disappears, and the action it describes is no longer on screen. The reader has to be told the thing didn't happen and is theirs to redo. |
| `setError` / `setFormError` / `setNameError` / … | **No** | The form is still open and its submit button is under their thumb. "Please try again" next to a Save button is decoration. |

This is the audit's "network blip yes, validation failure no" made mechanical.
It lands in the same place, because of how errors reach the screen here: nearly
every write uses

```js
err?.response?.data?.message || "Couldn't …"
```

so when the server *refuses for a reason* — a validation failure, an account
with history that can't be deleted — the reader sees the server's own message
and our fallback never runs. The fallback is the case where the request didn't
land at all. Inline errors are where server validation messages surface, which
is exactly where a retry prompt would be wrong.

**Consequence to preserve:** the presence of "Please try again" now means
something. Don't add it to an inline error to make a pair of messages match,
and don't strip it from a toast for brevity.

**One thing given up:** `TransactionsPage` used to say "Pull to refresh or try
again", naming a real affordance. It's now the standard line. That trades a
little specificity for one ending across the app — reverse it if the pull
gesture ever becomes the primary recovery.

## Naming the object

Errors name what failed. "Couldn't save that" became "Couldn't save this
repeating entry" — *that* does no work when the sheet can hold several kinds of
thing.

## Capitalisation

Apple-style title case for labels, buttons, headings, form labels and column
headers. Sentence case for body text, empty-state explanations, helper text,
**error messages** and footnotes. The test: *is it a label, or is it a
sentence?* Full rule and scope in `CONTENT_AUDIT.md`.

Not title-cased: `aria-label` and other accessible-name-only strings (screen
readers don't announce capitalisation), and anything CSS uppercases anyway —
`.overline`, and the inline `uppercase` used by Home's In / Out / Reserved strip.

## "Saved" means one thing

**Saved** = money actually set aside, in a finished period. Never used for money
that merely hasn't been spent yet.

- Home's strip cell is **Reserved** — a target, a plan.
- Home's tile is **Unspent So Far**, derived from the pace bar so the two always
  sum to 100.
- Tracker's ring is **Unspent** — a live period, so nothing is saved yet.
- `percentageSaved` on **Stats** keeps its income denominator and its name:
  those months have finished, so money not spent really was saved.

## Money formatting

`formatMoney` pins `en-SG`. See the comment on the function for why the locale
isn't left to the runtime, and where to change it if a second currency lands.
