/**
 * Company holidays, stored as Holiday day records.
 *
 * A holiday on a weekend is observed on the nearest weekday: Saturday on
 * the Friday before, Sunday on the Monday after. The record sits on the
 * observed weekday (that's the day off that counts) and keeps the real
 * date in `observedFrom`.
 */
/** @import { Day, Holiday } from "./types.js" */
import { addDays, isDateKey, weekday } from "./dates.js";
import { isBlankDay } from "./days.js";

const SATURDAY = 6;
const SUNDAY = 0;

/**
 * A Holiday day record.
 * @param {string} date  The day it's observed (a weekday).
 * @param {string} name
 * @param {string} [observedFrom]  The real date, when it falls on a weekend.
 * @returns {Day}
 */
export function holidayDay(date, name, observedFrom) {
  /** @type {Day} */
  const day = { date, status: "holiday", recorded: null, actual: null, note: name.trim() || null };

  if (observedFrom && observedFrom !== date) day.observedFrom = observedFrom;

  return day;
}

/**
 * The holiday's real calendar date.
 * @param {Day} day
 */
export const holidayDateOf = (day) => day.observedFrom ?? day.date;

/**
 * Place a holiday on the calendar. Weekend dates move to the nearest
 * weekday (Sat -> Fri, Sun -> Mon), stepping further the same way past
 * another holiday. A day you've already logged is never overwritten.
 * @param {Day[]} days
 * @param {string} date  The real date.
 * @param {string} name
 * @param {string | null} [moving]  Date of the record being moved (ignored when checking for clashes).
 * @returns {{ day: Day, error: null } | { day: null, error: string }}
 */
export function placeHoliday(days, date, name, moving = null) {
  const byDate = new Map(days.filter((d) => d.date !== moving).map((d) => [d.date, d]));
  const dow = weekday(date);
  let observed = date;

  if (dow === SATURDAY || dow === SUNDAY) {
    const step = dow === SATURDAY ? -1 : 1;

    observed = addDays(date, step);

    while (byDate.get(observed)?.status === "holiday" || weekday(observed) === SATURDAY || weekday(observed) === SUNDAY) {
      observed = addDays(observed, step);
    }
  }

  const existing = byDate.get(observed);

  if (existing && !isBlankDay(existing)) {
    return {
      day: null,
      error: observed === date ? `${date} already has an entry.` : `${date} is a weekend; its weekday ${observed} already has an entry.`,
    };
  }

  return { day: holidayDay(observed, name, date), error: null };
}

/**
 * Put a holiday in a day list (replacing the record being moved, if any).
 * @param {Day[]} days
 * @param {Day} day
 * @param {string | null} [moving]
 */
const withHoliday = (days, day, moving = null) => [...days.filter((d) => d.date !== day.date && d.date !== moving), day];

/**
 * Turn a list of holidays (older backups) into Holiday days. Dates you
 * already logged keep your record.
 * @param {Day[]} days
 * @param {Holiday[]} holidays
 * @returns {{ days: Day[], added: number }}
 */
export function holidaysAsDays(days, holidays) {
  let next = days;
  let added = 0;

  for (const h of holidays) {
    const placed = placeHoliday(next, h.date, h.name);

    if (!placed.day) continue;

    next = withHoliday(next, placed.day);
    added++;
  }

  return { days: next, added };
}

/**
 * Holidays whose real date is on or after `from`, by real date.
 * @param {Day[]} days
 * @param {string} from "YYYY-MM-DD"
 */
export const holidaysFrom = (days, from) =>
  days.filter((d) => d.status === "holiday" && holidayDateOf(d) >= from).sort((a, b) => holidayDateOf(a).localeCompare(holidayDateOf(b)));

/**
 * One year's holidays, by real date.
 * @param {Day[]} days
 * @param {string} year "YYYY"
 */
export const holidaysIn = (days, year) => holidaysFrom(days, `${year}-01-01`).filter((d) => holidayDateOf(d).startsWith(`${year}-`));

/**
 * Next year's holidays from this year's: same real month and day, same
 * names, observed on the right weekday for the new year. Dates that don't
 * exist (Feb 29) or clash with a logged day are skipped.
 * @param {Day[]} days
 * @param {string} fromYear
 * @param {string} toYear
 * @returns {Day[]} the new Holiday days
 */
export function copyHolidays(days, fromYear, toYear) {
  let next = days;

  /** @type {Day[]} */
  const added = [];

  for (const source of holidaysIn(days, fromYear)) {
    const date = `${toYear}${holidayDateOf(source).slice(4)}`;

    if (!isDateKey(date) || next.some((d) => d.status === "holiday" && holidayDateOf(d) === date)) continue;

    const placed = placeHoliday(next, date, source.note ?? "");

    if (!placed.day) continue;

    next = withHoliday(next, placed.day);
    added.push(placed.day);
  }

  return added;
}
