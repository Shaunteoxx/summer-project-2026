import { useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Delete } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn, formatMoney } from "@/lib/utils";
import { applyKey, evaluate, formatExpression, roundMoney, stateFromValue } from "@/lib/calc";

/** Matches the ceiling the transaction form validates against. */
const MAX_AMOUNT = 1e9;

/**
 * The sign carries the transaction type; the colour barely does. Income is
 * green because green means money arriving, but an expense is INK, not red —
 * spending is the normal case in a spending tracker, and red has to still mean
 * "over budget" when it turns up somewhere that matters.
 *
 * The tinted card, the border and the blurred glow are all gone with it. The
 * panel used to be a red-tinted display in a red border above a red confirm
 * button, which made entering a $4 coffee look like an error report.
 */
const TONES = {
  success: { sign: "+", text: "text-positive" },
  destructive: { sign: "−", text: "text-ink" },
};

/**
 * Keys are hueless, and now sit on the surface ramp rather than on opacities of
 * `foreground`: digits on surface-2, operators one step up on surface-3, and
 * `=` in solid ink because it is the one key that resolves the expression.
 * Three tiers, one ramp — the keypad reads as depth without a single shadow.
 */
const KEY_TONES = {
  digit: "bg-surface-2 text-ink hover:bg-surface-3",
  operator: "bg-surface-3 text-ink hover:bg-hairline-strong",
  equals: "bg-ink text-surface hover:bg-ink-2",
  // Legible rather than loud: clearing is secondary, but not a whisper.
  utility: "bg-surface-2 text-ink-2 hover:bg-surface-3",
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
  { key: "=", tone: "equals", ariaLabel: "Equals" },
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
  if (text.length > 14) return "text-[26px]";
  if (text.length > 11) return "text-[32px]";
  return "text-[40px]";
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
      {/* Display. Bare on the sheet's surface: the keys below carry the only
          fills in the panel, so a background here would flatten them. The
          expression line is Geist Mono, matching the keys it came from. */}
      <div className="pb-1">
        <div
          ref={expressionRef}
          aria-hidden="true"
          className="min-h-[1.25rem] overflow-x-auto whitespace-nowrap text-right font-mono text-[13px] text-ink-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {expression || " "}
        </div>
        <div
          role="status"
          aria-live="polite"
          className={cn(
            "num-display text-right leading-tight",
            resultSizeClass(resultText),
            rounded === null || isPartialZero
              ? "text-ink-3"
              : blockedReason !== null || rounded < 0
                ? "text-negative"
                : palette.text
          )}
        >
          {resultText}
        </div>
      </div>

      {blockedReason !== null && (
        <p role="alert" className="text-[13px] font-medium text-negative">
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
              "flex h-[52px] cursor-pointer select-none items-center justify-center rounded-sm font-mono text-[19px] font-medium transition-colors duration-micro ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface",
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
        {/* Ink, not the transaction's colour: a red "Use $4.50" made logging
            an ordinary expense look like a destructive action. */}
        <Button
          type="button"
          onClick={handleApply}
          disabled={!canApply}
          className="flex-[2]"
        >
          {canApply ? `Use ${formatMoney(rounded)}` : "Use Amount"}
        </Button>
      </div>
    </motion.div>
  );
}
