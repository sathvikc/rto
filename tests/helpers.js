/** Synthetic fixtures for tests. Never put real timesheet data here. */
/** @import { Day, DayStatus } from "../src/js/domain/types.js" */

/**
 * An office day with your own punch times.
 * @param {string} date
 * @param {string} start
 * @param {string | null} end
 * @returns {Day}
 */
export const office = (date, start, end) => ({
  date,
  status: "office",
  recorded: { start, end, hours: null, pto: null },
  actual: null,
  note: null,
});

/**
 * A day with only a type and no entries.
 * @param {string} date
 * @param {DayStatus} status
 * @returns {Day}
 */
export const plain = (date, status) => ({ date, status, recorded: null, actual: null, note: null });
