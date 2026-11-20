/** @import { Day, Holiday, MonthStat, Settings } from "./types.js" */
import { addDays, groupKey, isWeekday, startOfWeekSunday } from "./dates.js";
import { countsInAverage, isOpen, presenceOf, resolveDay } from "./days.js";

/** Longest a tracking month can run past its calendar month's 1st, days. */
const GROUP_SCAN_DAYS = 40;

/** @param {Holiday[]} holidays */
const holidayDates = (holidays) => new Set(holidays.map((h) => h.date));

/**
 * Monthly average and presence, recalculated from the daily records.
 *
 * Presence % = present days / Mon-Fri weekdays of the weeks that have at
 * least one record in the month, up to today, minus company holidays. A
 * weekday with no record inside a logged week counts as absent; a week
 * with no records at all is not counted.
 *
 * @param {Day[]} days
 * @param {Holiday[]} holidays
 * @param {Settings} settings
 * @param {string} today
 * @returns {MonthStat[]} oldest first
 */
export function monthlyStats(days, holidays, settings, today) {
  const holidaySet = holidayDates(holidays);
  const currentKey = groupKey(today, settings.grouping);

  /** @type {Map<string, Day[]>} */
  const groups = new Map();
  for (const day of days) {
    const key = groupKey(day.date, settings.grouping);
    const list = groups.get(key);
    if (list) list.push(day);
    else groups.set(key, [day]);
  }

  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, rows]) => {
      let total = 0;
      let counted = 0;
      let unverified = 0;
      let unverifiedAvg = 0;
      const resolved = new Map(rows.map((day) => [day.date, { day, r: resolveDay(day, settings) }]));

      for (const { day, r } of resolved.values()) {
        const inAverage = countsInAverage(day, r);
        if (inAverage && r.total !== null) {
          total += r.total;
          counted++;
        }
        if (!r.verified && !r.open && day.date <= today && (inAverage || day.status !== "office" || r.pto !== null)) {
          unverified++;
          if (inAverage) unverifiedAvg++;
        }
      }

      let denom = 0;
      let present = 0;
      let wfh = 0;
      const weeks = new Set(rows.filter((d) => d.date <= today).map((d) => startOfWeekSunday(d.date)));
      for (const sunday of weeks) {
        for (let i = 1; i <= 5; i++) {
          const date = addDays(sunday, i);
          if (date > today || groupKey(date, settings.grouping) !== key) continue;
          const rec = resolved.get(date);
          const workedOnHoliday = rec && rec.day.status === "office" && rec.r.work !== null;
          if (holidaySet.has(date) && !workedOnHoliday) continue;
          denom++;
          if (rec) {
            present += presenceOf(rec.day, rec.r);
            if (rec.day.status === "wfh") wfh++;
          }
        }
      }

      return {
        key,
        total,
        counted,
        avg: counted ? total / counted : null,
        present,
        denom,
        wfh,
        presencePct: denom ? Math.min(100, Math.round((present / denom) * 100)) : null,
        unverified,
        unverifiedAvg,
        partial: key === currentKey,
      };
    });
}

/**
 * Office days left in a month that can still move the average: Mon-Fri,
 * from today on, in the month (a tracking month runs into the next
 * calendar month), not a company holiday, not already planned as
 * WFH/OOO/Sick, and not today when today is already logged.
 *
 * @param {string} monthKey
 * @param {Day[]} days
 * @param {Holiday[]} holidays
 * @param {Settings} settings
 * @param {string} today
 */
export function workdaysLeft(monthKey, days, holidays, settings, today) {
  const holidaySet = holidayDates(holidays);
  const byDate = new Map(days.map((d) => [d.date, d]));
  const first = `${monthKey}-01`;
  const last = addDays(first, GROUP_SCAN_DAYS);
  let count = 0;
  for (let date = today > first ? today : first; date <= last; date = addDays(date, 1)) {
    if (groupKey(date, settings.grouping) !== monthKey || !isWeekday(date) || holidaySet.has(date)) continue;
    const day = byDate.get(date);
    if (day && day.status !== "office") continue;
    if (date === today && day && !isOpen(day) && (day.recorded || day.actual)) continue;
    count++;
  }
  return count;
}

/**
 * Average needed on each remaining day to finish the month at `target`.
 * @param {Pick<MonthStat, "total" | "counted"> | null} stat
 * @param {number} left
 * @param {number} target
 * @returns {number | null}
 */
export function neededAverage(stat, left, target) {
  if (left <= 0) return null;
  const total = stat?.total ?? 0;
  const counted = stat?.counted ?? 0;
  return Math.max(0, (target * (counted + left) - total) / left);
}

/**
 * Totals across several months (the "by year" chart).
 * @param {MonthStat[]} stats
 */
export function combineStats(stats) {
  const sum = stats.reduce(
    (a, s) => ({
      total: a.total + s.total,
      counted: a.counted + s.counted,
      present: a.present + s.present,
      denom: a.denom + s.denom,
      partial: a.partial || s.partial,
    }),
    { total: 0, counted: 0, present: 0, denom: 0, partial: false },
  );
  return {
    ...sum,
    avg: sum.counted ? sum.total / sum.counted : null,
    presencePct: sum.denom ? Math.min(100, Math.round((sum.present / sum.denom) * 100)) : null,
  };
}
