/**
 * A small arithmetic engine for the transaction amount keypad.
 *
 * An expression is an array of tokens that alternate entry/operator, e.g.
 * ["12.50", "+", "8", "÷", "2"]. Entries are kept as strings so a half-typed
 * "0." survives until the user adds digits, and so backspace can peel off one
 * character at a time.
 *
 * Deliberately hand-rolled rather than eval()/new Function(): keypad input is
 * user-controlled text, and there is no reason to hand it to a JS parser.
 */

export const OPERATORS = ["÷", "×", "−", "+"];

const OPERATOR_SET = new Set(OPERATORS);

/** Digits allowed in one entry, so a long press can't overflow the display. */
const MAX_ENTRY_DIGITS = 12;
/** Money is two decimal places; results of a division may carry more. */
const MAX_ENTRY_DECIMALS = 2;

export const isOperator = (token) => OPERATOR_SET.has(token);

/** Drop float dust like 0.1 + 0.2 → 0.30000000000000004, and round to cents. */
export function roundMoney(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/**
 * Evaluate an expression. A trailing operator means the user is mid-entry, so
 * the completed part is evaluated instead — that keeps the display live as
 * they type rather than blanking out between operands.
 *
 * @returns {{ value: number|null, error: string|null }}
 */
export function evaluate(tokens) {
  const parts = tokens.slice();
  if (parts.length > 0 && isOperator(parts[parts.length - 1])) parts.pop();
  if (parts.length === 0) return { value: null, error: null };

  // Pass 1: fold × and ÷, which bind tighter than + and −.
  const folded = [Number(parts[0])];
  for (let i = 1; i < parts.length; i += 2) {
    const operator = parts[i];
    const right = Number(parts[i + 1]);
    if (operator === "×") {
      folded[folded.length - 1] *= right;
    } else if (operator === "÷") {
      if (right === 0) return { value: null, error: "Can't divide by zero." };
      folded[folded.length - 1] /= right;
    } else {
      folded.push(operator, right);
    }
  }

  // Pass 2: fold + and − left to right.
  let value = folded[0];
  for (let i = 1; i < folded.length; i += 2) {
    value = folded[i] === "+" ? value + folded[i + 1] : value - folded[i + 1];
  }

  if (!Number.isFinite(value)) {
    return { value: null, error: "That doesn't work out to a number." };
  }
  return { value, error: null };
}

/** Human-readable expression for the display line, e.g. "12.50 + 8". */
export function formatExpression(tokens) {
  return tokens.join(" ");
}

function pressDigit(tokens, digit) {
  const last = tokens[tokens.length - 1];
  if (last === undefined || isOperator(last)) return [...tokens, digit];

  // "0" is a placeholder, not a leading zero: 0 then 5 reads as 5, not 05.
  if (last === "0") return [...tokens.slice(0, -1), digit];

  const [, decimals = ""] = last.split(".");
  if (last.includes(".") && decimals.length >= MAX_ENTRY_DECIMALS) return tokens;
  if (last.replace(/[.]/g, "").length >= MAX_ENTRY_DIGITS) return tokens;

  return [...tokens.slice(0, -1), last + digit];
}

function pressDecimal(tokens) {
  const last = tokens[tokens.length - 1];
  if (last === undefined || isOperator(last)) return [...tokens, "0."];
  if (last.includes(".")) return tokens;
  return [...tokens.slice(0, -1), last + "."];
}

function pressOperator(tokens, operator) {
  const last = tokens[tokens.length - 1];
  // Nothing to operate on yet — an expression can't open with an operator.
  if (last === undefined) return tokens;
  // Swapping your mind on the operator replaces it rather than stacking.
  if (isOperator(last)) return [...tokens.slice(0, -1), operator];
  return [...tokens, operator];
}

function pressBackspace(tokens) {
  const last = tokens[tokens.length - 1];
  if (last === undefined) return tokens;
  if (isOperator(last) || last.length === 1) return tokens.slice(0, -1);
  return [...tokens.slice(0, -1), last.slice(0, -1)];
}

/**
 * Keypad state. `sealed` marks an expression that was just collapsed by "=",
 * so the next digit starts a new entry instead of being appended to the
 * result — pressing 5 after "= 20" means 5, not 205.
 */
export const emptyState = () => ({ tokens: [], sealed: false });

/**
 * Apply one keypress and return the next state.
 * Unknown keys leave the state untouched.
 */
export function applyKey(state, key) {
  const { tokens, sealed } = state;

  if (/^[0-9]$/.test(key)) {
    return { tokens: pressDigit(sealed ? [] : tokens, key), sealed: false };
  }
  if (key === ".") {
    return { tokens: pressDecimal(sealed ? [] : tokens), sealed: false };
  }
  // Operators and backspace keep operating on the result, so they don't reset.
  if (isOperator(key)) return { tokens: pressOperator(tokens, key), sealed: false };
  if (key === "backspace") return { tokens: pressBackspace(tokens), sealed: false };
  if (key === "clear") return emptyState();
  if (key === "=") {
    const { value, error } = evaluate(tokens);
    if (error !== null || value === null) return state;
    // Collapse to a single entry so the result can be operated on again.
    return { tokens: [String(roundMoney(value))], sealed: true };
  }
  return state;
}

/**
 * Seed state from whatever is already in the amount field, so opening the
 * keypad continues from that number instead of starting over.
 */
export function stateFromValue(value) {
  const text = String(value ?? "").trim();
  if (text === "") return emptyState();
  const parsed = Number(text);
  if (!Number.isFinite(parsed) || parsed <= 0) return emptyState();
  return { tokens: [String(roundMoney(parsed))], sealed: true };
}
