/** @import { Day, Entry, Settings } from "./types.js" */
import { STEP_MINUTES } from "./constants.js";
import { addDays, weekday } from "./dates.js";
import { predictEntry } from "./days.js";
import { isTime, toMinutes } from "./time.js";

const FRIDAY = 5;

/**
 * Last date the official timesheet covers. It is published every
 * `releaseDay` (default Wednesday) and runs through the Friday before.
 * @param {string} today
 * @param {number} releaseDay 0 = Sunday
 */
export function timesheetCoverage(today, releaseDay) {
  const release = addDays(today, -((weekday(today) - releaseDay + 7) % 7));
  return addDays(release, -((weekday(release) - FRIDAY + 7) % 7 || 7));
}

/**
 * @typedef {object} GraceFit
 * @property {number} lo   Smallest grace consistent with every day.
 * @property {number} hi   Largest grace consistent with every day.
 * @property {boolean} ok  false when the days contradict each other.
 * @property {number} used Days that constrained the range.
 * @property {number} odd  Days where the timesheet is neither the floor nor the ceiling.
 *
 * @typedef {object} Mismatch
 * @property {string} date
 * @property {Entry} recorded
 * @property {Entry} predicted
 * @property {Entry} actual
 *
 * @typedef {object} RoundingReport
 * @property {{ match: number, total: number }} in
 * @property {{ match: number, total: number }} out
 * @property {Mismatch[]} mismatches
 * @property {{ in: GraceFit | null, out: GraceFit | null }} fit
 */

/**
 * The range of grace minutes that explains every observed (raw, timesheet)
 * pair, where grace means "round down when this many minutes past or fewer".
 * @param {Array<[string, string]>} pairs
 * @returns {GraceFit | null}
 */
export function fitGrace(pairs) {
  let lo = 0;
  let hi = STEP_MINUTES - 1;
  let used = 0;
  let odd = 0;
  for (const [raw, actual] of pairs) {
    const minutes = toMinutes(raw);
    const past = minutes % STEP_MINUTES;
    if (past === 0) continue;
    const down = minutes - past;
    const up = (down + STEP_MINUTES) % 1440;
    const got = toMinutes(actual);
    if (got === down) {
      lo = Math.max(lo, past);
      used++;
    } else if (got === up) {
      hi = Math.min(hi, past - 1);
      used++;
    } else {
      odd++;
    }
  }
  return used ? { lo, hi, ok: lo <= hi, used, odd } : null;
}

/**
 * How well the rounding rules predict the timesheet, from days that have
 * both your punches and verified timesheet times.
 * @param {Day[]} days
 * @param {Settings} settings
 * @returns {RoundingReport}
 */
export function roundingCheck(days, settings) {
  /** @type {RoundingReport} */
  const report = { in: { match: 0, total: 0 }, out: { match: 0, total: 0 }, mismatches: [], fit: { in: null, out: null } };
  /** @type {Array<[string, string]>} */
  const ins = [];
  /** @type {Array<[string, string]>} */
  const outs = [];

  for (const day of days) {
    const { recorded: rec, actual: act } = day;
    if (!rec || !act || !isTime(rec.start) || !isTime(rec.end) || !isTime(act.start) || !isTime(act.end)) continue;
    const predicted = /** @type {Entry} */ (predictEntry(rec, settings));
    const inOk = predicted.start === act.start;
    const outOk = predicted.end === act.end;
    report.in.total++;
    report.out.total++;
    if (inOk) report.in.match++;
    if (outOk) report.out.match++;
    if (!inOk || !outOk) report.mismatches.push({ date: day.date, recorded: rec, predicted, actual: act });
    ins.push([rec.start, act.start]);
    outs.push([rec.end, act.end]);
  }

  report.fit = { in: fitGrace(ins), out: fitGrace(outs) };
  return report;
}
