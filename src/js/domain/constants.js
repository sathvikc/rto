/** @import { DayStatus, Settings } from "./types.js" */

/** Timesheet rounding grid, minutes. */
export const STEP_MINUTES = 15;

/** @type {readonly DayStatus[]} */
export const STATUSES = Object.freeze(["office", "wfh", "ooo", "sick", "holiday"]);

/** @type {Readonly<Record<DayStatus, string>>} */
export const STATUS_LABEL = Object.freeze({ office: "Office", wfh: "WFH", ooo: "OOO", sick: "Sick", holiday: "Holiday" });

const WEDNESDAY = 3;

/** @type {Settings} */
const defaultSettings = {
  grouping: "tracking",
  roundIn: { mode: "down" },
  roundOut: { mode: "custom", grace: 4 },
  target: 8,
  workdaysOverride: null,
  releaseDay: WEDNESDAY,
};

export const DEFAULT_SETTINGS = Object.freeze(defaultSettings);

export const BACKUP_VERSION = 2;

/** Days without an export before the backup reminder shows. */
export const BACKUP_REMINDER_DAYS = 14;
