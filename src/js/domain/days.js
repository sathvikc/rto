/** @import { Day, Entry, Resolved, Settings } from "./types.js" */
import { roundTime } from "./rounding.js";
import { isTime, spanHours } from "./time.js";

/** @type {Readonly<Entry>} */
export const EMPTY_ENTRY = Object.freeze({ start: null, end: null, hours: null, pto: null });

/**
 * What the timesheet should show for your entry under the rounding rules.
 * @param {Entry | null} entry
 * @param {Settings} settings
 * @returns {Entry | null}
 */
export function predictEntry(entry, settings) {
  if (!entry) return null;

  if (isTime(entry.start) && isTime(entry.end)) {
    const start = roundTime(entry.start, settings.roundIn);
    const end = roundTime(entry.end, settings.roundOut);

    return { start, end, hours: spanHours(start, end), pto: entry.pto };
  }

  return { ...entry };
}

/**
 * Clocked in with no clock-out yet.
 * @param {Day} day
 */
export function isOpen(day) {
  const r = day.recorded;

  return !!r && isTime(r.start) && !r.end && r.hours === null;
}

/**
 * Numbers a day contributes. The timesheet (actual) wins when present;
 * otherwise your entry with the rounding rules applied.
 * @param {Day} day
 * @param {Settings} settings
 * @returns {Resolved}
 */
export function resolveDay(day, settings) {
  const verified = day.actual !== null;

  /** @type {Entry} */
  let entry;

  if (day.actual) {
    const a = day.actual;

    entry = { ...a, hours: a.hours ?? spanHours(a.start, a.end) };
  } else {
    entry = predictEntry(day.recorded, settings) ?? EMPTY_ENTRY;
  }

  const open = !verified && isOpen(day);
  const work = open ? null : entry.hours;
  const pto = entry.pto;
  const total = work === null && pto === null ? null : (work ?? 0) + (pto ?? 0);

  return { verified, open, entry, work, pto, total };
}

/**
 * Average hours count non-WFH days with work hours (work + PTO, like the
 * timesheet's "hours with PTO"). PTO-only, WFH and blank days are left out.
 * @param {Day} day
 * @param {Resolved} r
 */
export const countsInAverage = (day, r) => day.status !== "wfh" && r.work !== null;

/**
 * WFH = 0. OOO and Sick = 1. Office = 1 when the day has hours, PTO or an
 * open punch, else 0.
 * @param {Day} day
 * @param {Resolved} r
 * @returns {0 | 1}
 */
export function presenceOf(day, r) {
  if (day.status === "wfh") return 0;
  if (day.status === "ooo" || day.status === "sick") return 1;

  return r.work !== null || r.pto !== null || r.open ? 1 : 0;
}

/**
 * A logged day that has not been confirmed against the timesheet.
 * @param {Day} day
 */
export function needsVerification(day) {
  if (day.actual || isOpen(day)) return false;

  return day.recorded !== null || day.status !== "office";
}
