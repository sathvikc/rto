/** @import { Grouping } from "./types.js" */

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** @param {number} n */
export const pad2 = (n) => String(n).padStart(2, "0");

/**
 * Local calendar date as "YYYY-MM-DD".
 * @param {Date} d
 */
export const toDateKey = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

/** @param {string} key */
export function parseDateKey(key) {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/**
 * True for a real calendar date in "YYYY-MM-DD" form (rejects 2026-02-30).
 * @param {unknown} value
 * @returns {value is string}
 */
export function isDateKey(value) {
  return typeof value === "string" && DATE_RE.test(value) && toDateKey(parseDateKey(value)) === value;
}

/**
 * @param {string} key
 * @param {number} days
 */
export function addDays(key, days) {
  const d = parseDateKey(key);
  d.setDate(d.getDate() + days);
  return toDateKey(d);
}

/** @param {string} key  0 = Sunday */
export const weekday = (key) => parseDateKey(key).getDay();

/** @param {string} key */
export function isWeekday(key) {
  const w = weekday(key);
  return w >= 1 && w <= 5;
}

/** @param {string} key */
export const startOfWeekSunday = (key) => addDays(key, -weekday(key));

/** @param {string} key */
export function startOfWeekMonday(key) {
  const w = weekday(key);
  return addDays(key, w === 0 ? -6 : 1 - w);
}

/**
 * Month a day belongs to, as "YYYY-MM".
 * Tracking month = month of the week's Sunday, so a week that straddles a
 * month boundary belongs entirely to the earlier month. Calendar month =
 * the date's own month.
 * @param {string} key
 * @param {Grouping} grouping
 */
export function groupKey(key, grouping) {
  return (grouping === "calendar" ? key : startOfWeekSunday(key)).slice(0, 7);
}
