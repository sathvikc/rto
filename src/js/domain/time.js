import { pad2 } from "./dates.js";

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const MINUTES_PER_DAY = 1440;

/**
 * @param {unknown} value
 * @returns {value is string}
 */
export const isTime = (value) => typeof value === "string" && TIME_RE.test(value);

/** @param {string} time "HH:MM" */
export function toMinutes(time) {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

/** @param {number} minutes  Wraps around midnight. */
export function fromMinutes(minutes) {
  const m = ((minutes % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  return `${pad2(Math.floor(m / 60))}:${pad2(m % 60)}`;
}

/** @param {Date} d */
export const timeOf = (d) => `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;

/**
 * Hours between two times. An end before the start is an overnight shift;
 * equal times mean "no duration" (null), never a 0-hour day.
 * @param {string | null} start
 * @param {string | null} end
 * @returns {number | null}
 */
export function spanHours(start, end) {
  if (!isTime(start) || !isTime(end)) return null;
  const s = toMinutes(start);
  let e = toMinutes(end);
  if (e === s) return null;
  if (e < s) e += MINUTES_PER_DAY;
  return (e - s) / 60;
}

/** @param {number} n */
export const round2 = (n) => Math.round(n * 100) / 100;
