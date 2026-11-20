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
import { isOpen, needsVerification } from "../domain/days.js";
import { monthlyStats, neededAverage, workdaysLeft } from "../domain/stats.js";
import { timesheetCoverage } from "../domain/verification.js";
import { data, ui } from "./store.js";

/**
 * @typedef {object} Model
 * @property {MonthStat[]} stats         Oldest first.
 * @property {string} currentKey         Month containing today.
 * @property {string} selKey             Month selected for summary/history.
 * @property {MonthStat | null} selStat
 * @property {string[]} monthKeys        Newest first.
 * @property {number} autoLeft
 * @property {number} left
 * @property {number | null} needed
 * @property {string} coverage           Last date the latest timesheet covers.
 * @property {Day[]} toVerify            Oldest first.
 * @property {number} laterUnverified    Unverified days after the coverage date.
 * @property {Day | null} todayDay
 * @property {Day | null} openDay
 * @property {Holiday | null} todayHoliday
 * @property {Map<string, Holiday>} holidayByDate
 */

/** @type {Model} */
const initialModel = {
  stats: [],
  currentKey: "",
  selKey: "",
  selStat: null,
  monthKeys: [],
  autoLeft: 0,
  left: 0,
  needed: null,
  coverage: "",
  toVerify: [],
  laterUnverified: 0,
  todayDay: null,
  openDay: null,
  todayHoliday: null,
  holidayByDate: new Map(),
};
export const model = state(initialModel);

effect(() => {
  const { days, holidays, settings, loaded } = data;
  const { today, monthSel } = ui;
  if (!loaded) return;

  const stats = monthlyStats(days, holidays, settings, today);
  const currentKey = groupKey(today, settings.grouping);
  const monthKeys = [...new Set([...stats.map((s) => s.key), currentKey])].sort().reverse();
  const selKey = monthSel && monthKeys.includes(monthSel) ? monthSel : currentKey;
  const selStat = stats.find((s) => s.key === selKey) ?? null;
  const autoLeft = workdaysLeft(selKey, days, holidays, settings, today);
  const override = settings.workdaysOverride;
  const left = override?.key === selKey ? override.value : autoLeft;
  const coverage = timesheetCoverage(today, settings.releaseDay);
  const unverified = days.filter((d) => d.date <= today && needsVerification(d));
  const toVerify = unverified.filter((d) => d.date <= coverage).reverse();
  const holidayByDate = new Map(holidays.map((h) => [h.date, h]));

  batch(() => {
    Object.assign(model, {
      stats,
      currentKey,
      selKey,
      selStat,
      monthKeys,
      autoLeft,
      left,
      needed: neededAverage(selStat, left, settings.target),
      coverage,
      toVerify,
      laterUnverified: unverified.length - toVerify.length,
      todayDay: days.find((d) => d.date === today) ?? null,
      openDay: days.find(isOpen) ?? null,
      todayHoliday: holidayByDate.get(today) ?? null,
      holidayByDate,
    });
  });
});
