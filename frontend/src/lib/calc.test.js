// Keypad arithmetic. The cases that matter are the ones a naive left-to-right
// calculator gets wrong (operator precedence), the ones floating point gets
// wrong (money rounding), and the entry rules that stop a user typing something
// the transaction form would then reject.
import { describe, it, expect } from "vitest";

import { applyKey, emptyState, evaluate, roundMoney, stateFromValue } from "@/lib/calc";

/** Press a sequence of keys, starting from empty unless given a state. */
const type = (keys, start = emptyState()) => keys.reduce(applyKey, start);

/** Press a sequence and return the resulting value, or the error message. */
const result = (keys, start) => {
  const { value, error } = evaluate(type(keys, start).tokens);
  return error ?? (value === null ? null : roundMoney(value));
};

const digits = (text) => text.split("");

describe("evaluate", () => {
  it("sums a receipt", () => {
    expect(result(digits("12.50+8+3.20"))).toBe(23.7);
  });

  it("applies × and ÷ before + and −", () => {
    expect(result(["2", "+", "3", "×", "4"])).toBe(14);
    expect(result(["2", "0", "−", "6", "÷", "2"])).toBe(17);
  });

  it("folds + and − left to right", () => {
    expect(result(["1", "0", "−", "3", "−", "2"])).toBe(5);
  });

  it("refuses to divide by zero rather than returning Infinity", () => {
    expect(result(["1", "0", "÷", "0"])).toBe("Can't divide by zero.");
  });

  it("evaluates the completed part while an operator is pending", () => {
    expect(result(["1", "2", "+"])).toBe(12);
  });

  it("is null with nothing entered", () => {
    expect(result([])).toBeNull();
  });

  it("rounds float dust away", () => {
    expect(result(["0", ".", "1", "+", "0", ".", "2"])).toBe(0.3);
  });
});

describe("entry rules", () => {
  it("treats a leading zero as a placeholder", () => {
    expect(type(["0", "5"]).tokens).toEqual(["5"]);
  });

  it("seeds a decimal typed straight after an operator", () => {
    expect(type(["5", "+", "."]).tokens).toEqual(["5", "+", "0."]);
  });

  it("allows only one decimal point", () => {
    expect(type(["1", ".", "5", "."]).tokens).toEqual(["1.5"]);
  });

  it("caps entry at two decimal places, since amounts are money", () => {
    expect(type(["1", ".", "2", "3", "4"]).tokens).toEqual(["1.23"]);
  });

  it("replaces the pending operator instead of stacking", () => {
    expect(type(["5", "+", "−"]).tokens).toEqual(["5", "−"]);
  });

  it("will not open an expression with an operator", () => {
    expect(type(["+"]).tokens).toEqual([]);
  });

  it("backspaces a character, then the whole token", () => {
    expect(type(["1", "2", "3", "backspace"]).tokens).toEqual(["12"]);
    expect(type(["1", "+", "backspace"]).tokens).toEqual(["1"]);
    expect(type(["1", "+", "2", "backspace", "backspace"]).tokens).toEqual(["1"]);
  });

  it("clears", () => {
    expect(type(["1", "2", "clear"]).tokens).toEqual([]);
  });
});

describe("equals", () => {
  it("groups left to right, so a bill can be split", () => {
    // (12 + 8 + 5) ÷ 3
    expect(result(digits("12+8+5").concat(["=", "÷", "3"]))).toBe(8.33);
  });

  it("starts a new entry when a digit follows a result", () => {
    expect(type(["1", "2", "+", "8", "=", "5"]).tokens).toEqual(["5"]);
  });

  it("keeps operating on the result when an operator follows", () => {
    expect(type(["1", "2", "+", "8", "=", "×"]).tokens).toEqual(["20", "×"]);
  });

  it("is stable when pressed twice", () => {
    expect(type(["1", "2", "+", "8", "=", "="]).tokens).toEqual(["20"]);
  });

  it("resolves a pending operator", () => {
    expect(type(["1", "2", "+", "="]).tokens).toEqual(["12"]);
  });
});

describe("stateFromValue", () => {
  it("continues from the amount already in the field", () => {
    expect(stateFromValue("12.5")).toEqual({ tokens: ["12.5"], sealed: true });
  });

  it("starts empty for a blank or unusable field", () => {
    expect(stateFromValue("")).toEqual(emptyState());
    expect(stateFromValue("0")).toEqual(emptyState());
    expect(stateFromValue("-5")).toEqual(emptyState());
  });

  it("is sealed, so the first digit replaces rather than appends", () => {
    expect(type(["5"], stateFromValue("12.5")).tokens).toEqual(["5"]);
  });

  it("still extends when an operator or backspace follows", () => {
    expect(type(["+", "8"], stateFromValue("12.5")).tokens).toEqual(["12.5", "+", "8"]);
    expect(type(["backspace"], stateFromValue("12.5")).tokens).toEqual(["12."]);
  });
});
