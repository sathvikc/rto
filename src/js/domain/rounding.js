/** @import { RoundingRule } from "./types.js" */
import { STEP_MINUTES } from "./constants.js";
import { fromMinutes, toMinutes } from "./time.js";

const MAX_GRACE = STEP_MINUTES - 1;

/** Grace minutes each named mode stands for. */
export const PRESET_GRACE = Object.freeze({ down: MAX_GRACE, nearest: Math.floor(STEP_MINUTES / 2), up: 0 });

/**
 * Every rounding mode is one rule: round down when the minutes past the
 * last quarter hour are at most `grace`, otherwise round up.
 *   down = 14, nearest = 7, up = 0, custom = your number, none = no rounding.
 * Example, custom grace 4: 4:16-4:19 -> 4:15, 4:20-4:29 -> 4:30.
 * @param {RoundingRule} rule
 * @returns {number | null}  null for "none"
 */
export function graceOf(rule) {
  switch (rule.mode) {
    case "down":
    case "up":
    case "nearest":
      return PRESET_GRACE[rule.mode];
    case "custom":
      return Math.max(0, Math.min(MAX_GRACE, Math.round(Number(rule.grace) || 0)));
    default:
      return null;
  }
}

/**
 * @param {number} minutes
 * @param {RoundingRule} rule
 */
export function roundMinutes(minutes, rule) {
  const grace = graceOf(rule);
  const past = minutes % STEP_MINUTES;

  if (grace === null || past === 0) return minutes;

  return past <= grace ? minutes - past : minutes - past + STEP_MINUTES;
}

/**
 * @param {string} time "HH:MM"
 * @param {RoundingRule} rule
 */
export const roundTime = (time, rule) => fromMinutes(roundMinutes(toMinutes(time), rule));

/**
 * Plain-English description, e.g. for the punch screen.
 * @param {RoundingRule} rule
 */
export function describeRule(rule) {
  switch (rule.mode) {
    case "down":
      return "rounds down";
    case "up":
      return "rounds up";
    case "nearest":
      return "rounds to the nearest quarter";
    case "custom":
      return `rounds down up to ${graceOf(rule)} min past the quarter, otherwise up`;
    default:
      return "is not rounded";
  }
}
