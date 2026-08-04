import { useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Delete } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn, formatMoney } from "@/lib/utils";
import { applyKey, evaluate, formatExpression, roundMoney, stateFromValue } from "@/lib/calc";

/** Matches the ceiling the transaction form validates against. */
const MAX_AMOUNT = 1e9;

/**
 * Colour carries the transaction type, matching how the ledger renders amounts:
 * income green with a +, expenses red with a −. The tinted card and glow are
 * the same treatment the balance and daily-budget cards use.
 */
const TONES = {
  success: {
    sign: "+",
    card: "border-success/30 from-success/15",
    glow: "bg-success/25",
    text: "text-success",
  },
  destructive: {
    sign: "−",
    card: "border-destructive/30 from-destructive/15",
    glow: "bg-destructive/25",
    text: "text-destructive",
  },
};

/**
 * Keys are deliberately hueless. Green and red both carry meaning in this app —
 * income and expense — so tinting keys either way makes a semantic claim the
 * keypad isn't entitled to make. Tone-tinting them was tried and rejected: at
 * any opacity strong enough to read, the whole pad went pink on an expense and
 * looked like an error state.
 *
 * Both tiers derive from `foreground` rather than `muted` so they're one
 * family. `--muted` is hue 150, which puts a mint cast on light-mode keys —
 * fine as a global brand neutral, wrong here, where the sheet is plain white
 * and the keys would be the only tinted surface in the panel, sitting next to a
 * red display. Deriving from `foreground` also self-corrects across themes:
 * darker than the card in light mode, lighter in dark.
 *
 * That leaves the display tint and the Use button as the panel's only colour,
 * and the Use button as its only solid fill.
 */
const KEY_TONES = {
  digit: "bg-foreground/[0.06] text-foreground shadow-sm hover:bg-foreground/10",
  operator:
    "bg-foreground/[0.13] text-foreground shadow-sm hover:bg-foreground/[0.18] text-2xl font-bold",
  // Legible rather than loud: clearing is secondary, but muted-foreground on a
  // muted key washed out badly on screen.
  utility: "bg-foreground/[0.06] text-foreground/80 shadow-sm hover:bg-foreground/10",
};

// 4 columns × 5 rows. Spans are chosen so every row fills exactly 4 columns.
const KEYS = [
  { key: "clear", label: "C", tone: "utility", span: 2, ariaLabel: "Clear" },
  { key: "backspace", icon: Delete, tone: "utility", ariaLabel: "Backspace" },
  { key: "÷", tone: "operator", ariaLabel: "Divide" },
  { key: "7" },
  { key: "8" },
  { key: "9" },
  { key: "×", tone: "operator", ariaLabel: "Multiply" },
  { key: "4" },
  { key: "5" },
  { key: "6" },
  { key: "−", tone: "operator", ariaLabel: "Minus" },
  { key: "1" },
  { key: "2" },
  { key: "3" },
  { key: "+", tone: "operator", ariaLabel: "Plus" },
  { key: "0", span: 2 },
  { key: ".", ariaLabel: "Decimal point" },
  { key: "=", tone: "operator", ariaLabel: "Equals" },
];

/** Hardware-keyboard equivalents, for anyone using this on a desktop. */
const PHYSICAL_KEYS = {
  "*": "×",
  x: "×",
  X: "×",
  "/": "÷",
  "-": "−",
  "+": "+",
  "=": "=",
  ".": ".",
  ",": ".",
};

/** Shrink the result as it grows so −$1,000,000,000.00 still fits a small phone. */
function resultSizeClass(text) {
  if (text.length > 14) return "text-2xl";
  if (text.length > 11) return "text-3xl";
  return "text-[2.5rem]";
}

/**
 * Keypad for working out a transaction amount in place — splitting a bill,
 * summing receipt lines — without leaving the add-entry sheet.
 *
 * Purely local: it hands a finished number back through onApply and never
 * touches the budget period, so it behaves identically in month and days mode.
 */
export default function AmountCalculator({ initialValue, tone, onApply, onCancel }) {
  const reduceMotion = useReducedMotion();
  const [state, setState] = useState(() => stateFromValue(initialValue));
  const panelRef = useRef(null);
  const expressionRef = useRef(null);

  const palette = TONES[tone] ?? TONES.destructive;
  const { value, error } = evaluate(state.tokens);
  const rounded = value === null ? null : roundMoney(value);
  const expression = formatExpression(state.tokens);
  // A usable amount is shown the way the ledger shows it: signed by type. A
  // negative running total is a mistake in progress, so it keeps its own minus
  // rather than being dressed up as income or an expense.
  const resultText =
    rounded !== null && rounded > 0
      ? `${palette.sign}${formatMoney(rounded)}`
      : formatMoney(rounded ?? 0);

  // Why the amount can't be used yet, if it can't. Wording matches the
  // messages the transaction form itself shows, so the two never disagree.
  //
  // A lone "0" is someone part-way through typing "0.50", not a mistake — the
  // disabled Use button says enough. Only a real calculation landing on zero
  // or less gets called out.
  const isPartialZero = rounded !== null && rounded <= 0 && state.tokens.length < 2;
  let blockedReason = error;
  if (blockedReason === null && rounded !== null) {
    if (rounded > MAX_AMOUNT) blockedReason = "Keep it under $1,000,000,000.";
    else if (rounded <= 0 && !isPartialZero) {
      blockedReason = "Enter an amount greater than $0.";
    }
  }
  const canApply =
    rounded !== null && blockedReason === null && !isPartialZero && rounded > 0;

  // The sheet was already open when this mounted, so its focus effect has
  // been and gone — take focus here or the hardware keyboard has no target.
  useEffect(() => {
    panelRef.current?.focus({ preventScroll: true });
  }, []);

  // Keep the newest input visible when the expression outgrows its line.
  useEffect(() => {
    const el = expressionRef.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, [expression]);

  const press = (key) => setState((current) => applyKey(current, key));

  const handleApply = () => {
    if (canApply) onApply(rounded);
  };

  const handleKeyDown = (event) => {
    if (event.metaKey || event.ctrlKey || event.altKey) return;

    if (event.key === "Enter") {
      // A focused keypad button activates itself on Enter; don't also apply.
      if (event.target.tagName === "BUTTON") return;
      event.preventDefault();
      handleApply();
      return;
    }
    // Escape is handled by the sheet, which steps back to the form.
    if (event.key === "Escape") return;

    if (event.key === "Backspace") {
      event.preventDefault();
      press("backspace");
      return;
    }
    if (/^[0-9]$/.test(event.key)) {
      event.preventDefault();
      press(event.key);
      return;
    }
    const mapped = PHYSICAL_KEYS[event.key];
    if (mapped) {
      event.preventDefault();
      press(mapped);
    }
  };

  return (
    <motion.div
      ref={panelRef}
      tabIndex={-1}
      onKeyDown={handleKeyDown}
      initial={reduceMotion ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
      className="space-y-4 outline-none"
    >
      {/* Display — the tinted-card-and-glow treatment the balance and
          daily-budget cards use, so the keypad reads as part of the app. */}
      <div
        className={cn(
          "relative overflow-hidden rounded-2xl border bg-gradient-to-br via-card to-card px-5 py-4",
          palette.card
        )}
      >
        <div
          aria-hidden="true"
          className={cn(
            "pointer-events-none absolute -right-8 -top-8 h-28 w-28 rounded-full blur-3xl",
            palette.glow
          )}
        />
        <div
          ref={expressionRef}
          aria-hidden="true"
          className="relative min-h-[1.25rem] overflow-x-auto whitespace-nowrap text-right text-sm tabular-nums text-muted-foreground [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {expression || " "}
        </div>
        <div
          role="status"
          aria-live="polite"
          className={cn(
            "relative text-right font-extrabold leading-tight tracking-tight tabular-nums",
            resultSizeClass(resultText),
            rounded === null || isPartialZero
              ? "text-muted-foreground"
              : blockedReason !== null || rounded < 0
                ? "text-destructive"
                : palette.text
          )}
        >
          {resultText}
        </div>
      </div>

      {blockedReason !== null && (
        <p role="alert" className="text-sm font-medium text-destructive">
          {blockedReason}
        </p>
      )}

      {/* Keypad */}
      <div className="grid grid-cols-4 gap-2">
        {KEYS.map(({ key, label, icon: Icon, tone: keyTone = "digit", span, ariaLabel }) => (
          <motion.button
            key={key}
            type="button"
            onClick={() => press(key)}
            aria-label={ariaLabel}
            whileTap={reduceMotion ? undefined : { scale: 0.94 }}
            transition={{ type: "spring", stiffness: 400, damping: 17 }}
            className={cn(
              // Keys sit on a shadow that flattens on press, so a tap reads as
              // pushing something down rather than just changing colour.
              "flex h-[52px] cursor-pointer select-none items-center justify-center rounded-2xl text-xl font-semibold tabular-nums shadow-sm transition-colors active:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card",
              KEY_TONES[keyTone],
              span === 2 && "col-span-2"
            )}
          >
            {Icon ? <Icon className="h-5 w-5" /> : (label ?? key)}
          </motion.button>
        ))}
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        <Button type="button" variant="ghost" onClick={onCancel} className="flex-1">
          Cancel
        </Button>
        <Button
          type="button"
          variant={tone}
          onClick={handleApply}
          disabled={!canApply}
          className="flex-[2]"
        >
          {canApply ? `Use ${formatMoney(rounded)}` : "Use amount"}
        </Button>
      </div>
    </motion.div>
  );
}
