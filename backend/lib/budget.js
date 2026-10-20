import { roundMoney } from "./validation.js";
import { incomeAmount, spentAmount } from "./entryFields.js";

/*
 * The one definition of a window's money.
 *
 * Home's headline, the accounts card and the streak all report "left to
 * spend", and each used to work it out for itself — which is how changing what
 * counts as income once took edits in six places. They still gather their
 * inputs their own way (a list of entries, a Mongo aggregation, a walk day by
 * day), because each needs a different breakdown; the arithmetic on those
 * inputs lives here.
 */

/** Income and counted spending over a list of entries, rounded to the cent. */
export function sumEntries(entries) {
  let income = 0;
  let spent = 0;
  for (const t of entries) {
    income += incomeAmount(t);
    if (t.type === "expense") spent += spentAmount(t);
  }
  return { income: roundMoney(income), spent: roundMoney(spent) };
}

/**
 * What a window has to spread over its days, before its savings target.
 *
 * In term mode `funding` is the cycle's share of the lump sum, and it replaces
 * the income logged in the window rather than adding to it: the lump sum is
 * already inside the pot it was cut from. Everywhere else funding is null and
 * the window's money is simply its income.
 */
export const grossOf = ({ income, funding }) => funding ?? income;

/** What's left after spending and the savings target. Negative once overspent. */
export const leftToSpendOf = ({ income, funding, spent, savings }) =>
  roundMoney(grossOf({ income, funding }) - spent - savings);
