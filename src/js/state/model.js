/**
 * The derived model: every number the screen shows, computed in one place
 * from `data` and `ui`. Views read from `model` and redraw only what they
 * depend on.
 *
 * (Lume's computed().value is not tracked by effects, so derived values
 * live in a reactive store written by one effect instead.)
 */
/** @import { Day, Holiday, MonthStat } from "../domain/types.js" */
import { batch, effect, state } from "lume-js";
import { groupKey } from "../domain/dates.js";
import { isOpen, isVerified, needsVerification } from "../domain/days.js";
import { isStaleShift, usualTimes } from "../domain/shift.js";
import { freezeClosedMonths, monthlyStats, neededAverage, workdaysLeftDates } from "../domain/stats.js";
import { timesheetCoverage } from "../domain/verification.js";
import { data, ui } from "./store.js";

/**
 * @typedef {object} Model
 * @property {MonthStat[]} stats            Oldest first.
 * @property {string[]} monthKeys           Newest first; always includes the current month.
 * @property {string} currentKey            Month containing today (Home).
 * @property {MonthStat | null} currentStat
 * @property {number} autoLeft              Workdays left this month (auto).
 * @property {string[]} autoLeftDates       ...and which dates those are.
 * @property {number} left                  ...or the manual override.
 * @property {number | null} needed         Average needed on each remaining day.
 * @property {string} selKey                Month selected on the History tab.
 * @property {MonthStat[]} historyStats     Stats for History: all days, or verified only.
 * @property {MonthStat | null} selStat     Selected month in the History view.
 * @property {MonthStat | null} selStatOther  ...the same month in the other view, for comparison.
 * @property {string} coverage              Last date the latest timesheet covers.
 * @property {Day[]} toVerify               Oldest first.
 * @property {number} laterUnverified       Unverified days after the coverage date.
 * @property {Day | null} todayDay
 * @property {Day | null} openDay
 * @property {Holiday | null} todayHoliday
 * @property {Map<string, Holiday>} holidayByDate
 * @property {{ start: string, end: string } | null} usual  Typical clock-in/out.
 * @property {boolean} staleShift          An open shift looks like a forgotten clock-out.
 */

/** @type {Model} */
const initialModel = {
  stats: [],
  monthKeys: [],
  currentKey: "",
  currentStat: null,
  autoLeft: 0,
  autoLeftDates: [],
  left: 0,
  needed: null,
  selKey: "",
  historyStats: [],
  selStat: null,
  selStatOther: null,
  coverage: "",
  toVerify: [],
  laterUnverified: 0,
  todayDay: null,
  openDay: null,
  todayHoliday: null,
  holidayByDate: new Map(),
  usual: null,
  staleShift: false,
};

export const model = state(initialModel);

effect(() => {
  const { days, holidays, settings, loaded } = data;
  const { today, monthSel, verifiedOnly } = ui;

  if (!loaded) return;

  const coverage = timesheetCoverage(today, settings.releaseDay);

  // Closed months (fully covered by the timesheet) show their frozen
  // snapshot, so later changes to holidays or settings don't rewrite them.
  // Writing the snapshots back re-runs this effect once; the second run
  // finds nothing new and stops.
  const frozen = freezeClosedMonths(monthlyStats(days, holidays, settings, today), days, settings, coverage, data.snapshots);

  if (JSON.stringify(frozen.snapshots) !== JSON.stringify(data.snapshots)) data.snapshots = frozen.snapshots;

  const stats = frozen.stats;

  // History's "Verified only" view mirrors the official dashboard: verified
  // days (WFH/OOO/Sick count as verified) up to the date the latest
  // timesheet covers, with presence counted only up to that date.
  const verifiedStats = monthlyStats(
    days.filter((d) => d.date <= coverage && isVerified(d)),
    holidays,
    settings,
    coverage,
  );

  const historyStats = verifiedOnly ? verifiedStats : stats;
  const otherStats = verifiedOnly ? stats : verifiedStats;
  const currentKey = groupKey(today, settings.grouping);
  const currentStat = stats.find((s) => s.key === currentKey) ?? null;
  const monthKeys = [...new Set([...stats.map((s) => s.key), currentKey])].sort().reverse();
  const selKey = monthSel && monthKeys.includes(monthSel) ? monthSel : currentKey;
  const autoLeftDates = workdaysLeftDates(currentKey, days, holidays, settings, today);
  const autoLeft = autoLeftDates.length;
  const override = settings.workdaysOverride;
  const left = override?.key === currentKey ? override.value : autoLeft;
  const unverified = days.filter((d) => d.date <= today && needsVerification(d));
  const toVerify = unverified.filter((d) => d.date <= coverage).reverse();
  const holidayByDate = new Map(holidays.map((h) => [h.date, h]));

  batch(() => {
    Object.assign(model, {
      stats,
      monthKeys,
      currentKey,
      currentStat,
      autoLeft,
      autoLeftDates,
      left,
      needed: neededAverage(currentStat, left, settings.target),
      selKey,
      historyStats,
      selStat: historyStats.find((s) => s.key === selKey) ?? null,
      selStatOther: otherStats.find((s) => s.key === selKey) ?? null,
      coverage,
      toVerify,
      laterUnverified: unverified.length - toVerify.length,
      todayDay: days.find((d) => d.date === today) ?? null,
      openDay: days.find(isOpen) ?? null,
      todayHoliday: holidayByDate.get(today) ?? null,
      holidayByDate,
      usual: usualTimes(days),
    });
  });
});

// Separate effect: it reads the ticking clock, and writing the same boolean
// back is a no-op, so dependents only re-render when it actually flips.
effect(() => {
  const now = new Date(ui.nowMs);

  model.staleShift = isStaleShift(model.openDay, ui.today, now.getHours() * 60 + now.getMinutes());
});
