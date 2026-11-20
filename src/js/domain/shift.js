/** @import { Day, MonthStat, Settings } from "./types.js" */
import { STEP_MINUTES } from "./constants.js";
import { isOpen } from "./days.js";
import { graceOf, roundMinutes } from "./rounding.js";
import { fromMinutes, isTime, spanHours, toMinutes } from "./time.js";

/** Open shifts older than this are treated as a forgotten clock-out. */
const STALE_SHIFT_HOURS = 14;

const MINUTES_PER_DAY = 1440;

/**
 * A shift left open from an earlier day, or running implausibly long.
 * @param {Day | null} day
 * @param {string} today
 * @param {number} nowMinutes  Minutes since midnight today.
 */
export function isStaleShift(day, today, nowMinutes) {
  if (!day || !isOpen(day) || !day.recorded?.start) return false;

  if (day.date < today) return true;

  return nowMinutes - toMinutes(day.recorded.start) >= STALE_SHIFT_HOURS * 60;
}

/**
 * @typedef {object} LeaveOption
 * @property {string} at     When you leave ("HH:MM").
 * @property {string} out    What the timesheet would show.
 * @property {number} hours  Timesheet hours for the day.
 */

/**
 * @param {string} start
 * @param {number} leaveMinutes
 * @param {Settings} settings
 * @returns {LeaveOption}
 */
function optionAt(start, leaveMinutes, settings) {
  const inTime = fromMinutes(roundMinutes(toMinutes(start), settings.roundIn));
  const out = fromMinutes(roundMinutes(leaveMinutes, settings.roundOut));

  return { at: fromMinutes(leaveMinutes), out, hours: spanHours(inTime, out) ?? 0 };
}

/**
 * The next minute, after `nowMinutes`, at which leaving credits a later
 * quarter hour under the clock-out rule. null when there is no rounding.
 * @param {number} nowMinutes
 * @param {Settings} settings
 */
export function nextRoundingStep(nowMinutes, settings) {
  const grace = graceOf(settings.roundOut);

  if (grace === null) return null;

  const quarter = nowMinutes - (nowMinutes % STEP_MINUTES);
  const bump = quarter + grace + 1;

  return bump > nowMinutes ? bump : bump + STEP_MINUTES;
}

/**
 * Earliest leave minute at which the day reaches `hours` on the timesheet.
 * @param {string} start
 * @param {number} hours
 * @param {Settings} settings
 * @param {number} fromMinutes_  Search from this minute (now).
 * @returns {number | null}
 */
export function leaveMinuteFor(start, hours, settings, fromMinutes_) {
  const startMinutes = toMinutes(start);
  const limit = startMinutes + MINUTES_PER_DAY - 1;

  for (let m = Math.max(fromMinutes_, startMinutes + 1); m <= limit; m++) {
    if (optionAt(start, m, settings).hours >= hours - 1e-9) return m;
  }

  return null;
}

/**
 * @typedef {object} LeavePlan
 * @property {LeaveOption} now          Leaving right now.
 * @property {LeaveOption | null} next  The next minute that credits another quarter hour.
 * @property {LeaveOption | null} goal  Earliest exit that reaches `goalHours`.
 */

/**
 * What leaving now, or a little later, means for today's timesheet.
 * Minutes past midnight may exceed 1440 for a shift that crossed midnight.
 * @param {string} start  Clock-in, "HH:MM".
 * @param {number} nowMinutes
 * @param {Settings} settings
 * @param {number | null} goalHours  e.g. today's needed average.
 * @returns {LeavePlan | null}
 */
export function leavePlan(start, nowMinutes, settings, goalHours) {
  if (!isTime(start)) return null;

  const now = optionAt(start, nowMinutes, settings);
  const nextMinute = nextRoundingStep(nowMinutes, settings);
  const next = nextMinute === null ? null : optionAt(start, nextMinute, settings);

  let goal = null;

  if (goalHours !== null && goalHours > 0 && now.hours < goalHours) {
    const minute = leaveMinuteFor(start, goalHours, settings, nowMinutes);

    goal = minute === null ? null : optionAt(start, minute, settings);
  }

  return { now, next, goal };
}

/**
 * Median clock-in and clock-out from your recent office days, rounded to
 * 5 minutes. Uses your own punches, falling back to timesheet times.
 * @param {Day[]} days  Newest first.
 * @param {number} [sample]
 * @returns {{ start: string, end: string } | null}
 */
export function usualTimes(days, sample = 20) {
  /** @type {number[]} */
  const starts = [];

  /** @type {number[]} */
  const ends = [];

  for (const day of days) {
    if (starts.length >= sample) break;

    if (day.status !== "office") continue;

    const entry = day.recorded && isTime(day.recorded.start) && isTime(day.recorded.end) ? day.recorded : day.actual;

    if (!entry || !isTime(entry.start) || !isTime(entry.end)) continue;

    starts.push(toMinutes(entry.start));
    ends.push(toMinutes(entry.end));
  }

  if (starts.length < 3) return null;

  /** @param {number[]} list */
  const median = (list) => {
    const sorted = [...list].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    const value = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;

    return fromMinutes(Math.round(value / 5) * 5);
  };

  return { start: median(starts), end: median(ends) };
}

/**
 * Where the month ends if today ends with `hours` and each of the other
 * `restDays` remaining office days comes in at `restHours`. With no rest
 * days this is simply the average including today. (Today isn't in the
 * stats yet while you're on the clock.)
 * @param {Pick<MonthStat, "total" | "counted"> | null} stat
 * @param {number} hours       Today.
 * @param {number} [restDays]
 * @param {number} [restHours]
 */
export function projectedAverage(stat, hours, restDays = 0, restHours = 0) {
  const total = (stat?.total ?? 0) + hours + restDays * restHours;

  return total / ((stat?.counted ?? 0) + 1 + restDays);
}

/**
 * @typedef {"now" | "pace" | "target"} LeaveKind
 *
 * @typedef {object} LeaveRow
 * @property {LeaveKind[]} kinds  Why this row is shown (merged when two land on the same minute).
 * @property {string} at          Leave at, "HH:MM".
 * @property {string} out         Timesheet clock-out.
 * @property {number} hours       Timesheet hours for today.
 * @property {number} average     Projected month-end average if you leave then.
 */

/**
 * Leave options for the panel: now, the earliest exit that keeps the month
 * on pace (`paceHours`), and the earliest that makes a full `targetHours`
 * day. Rows for goals already met are dropped; rows on the same minute are
 * merged. Sorted by time.
 * @param {string} start  Clock-in, "HH:MM".
 * @param {number} nowMinutes  May exceed 1440 for a shift that crossed midnight.
 * @param {Settings} settings
 * Each row's average is the projected month end: today at that row's
 * hours, and the other `restDays` office days at the on-pace hours (or at
 * the target when you're already ahead). So "on pace" lands on the target,
 * a shorter day below it, a longer day above it.
 * @param {{ stat: Pick<MonthStat, "total" | "counted"> | null, paceHours: number | null, targetHours: number, restDays?: number }} goals
 * @returns {{ rows: LeaveRow[], next: LeaveOption | null }}
 */
export function leaveRows(start, nowMinutes, settings, { stat, paceHours, targetHours, restDays = 0 }) {
  if (!isTime(start)) return { rows: [], next: null };

  const now = optionAt(start, nowMinutes, settings);

  /** @type {Array<{ kind: LeaveKind, option: LeaveOption }>} */
  const picks = [{ kind: "now", option: now }];

  for (const [kind, hours] of /** @type {const} */ ([
    ["pace", paceHours],
    ["target", targetHours],
  ])) {
    if (hours === null || hours <= now.hours) continue;

    const minute = leaveMinuteFor(start, hours, settings, nowMinutes);

    if (minute !== null) picks.push({ kind, option: optionAt(start, minute, settings) });
  }

  const restHours = paceHours !== null && paceHours > 0 ? paceHours : targetHours;

  /** @type {Map<string, LeaveRow>} */
  const byTime = new Map();

  for (const { kind, option } of picks) {
    const existing = byTime.get(option.at);

    if (existing) existing.kinds.push(kind);
    else byTime.set(option.at, { kinds: [kind], ...option, average: projectedAverage(stat, option.hours, restDays, restHours) });
  }

  const nextMinute = nextRoundingStep(nowMinutes, settings);
  const next = nextMinute === null ? null : optionAt(start, nextMinute, settings);

  return {
    rows: [...byTime.values()].sort((a, b) => toMinutes(a.at) - toMinutes(b.at)),
    next: next && next.out !== now.out ? next : null,
  };
}
