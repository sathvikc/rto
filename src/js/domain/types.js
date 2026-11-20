/**
 * Shared JSDoc types. This module exports nothing at runtime.
 *
 * @typedef {"office" | "wfh" | "ooo" | "sick"} DayStatus
 *
 * @typedef {object} Entry
 *   One set of numbers for a day. Times are 24-hour "HH:MM".
 * @property {string | null} start
 * @property {string | null} end
 * @property {number | null} hours  Used only when there are no times.
 * @property {number | null} pto
 *
 * @typedef {object} Day
 * @property {string} date             "YYYY-MM-DD"
 * @property {DayStatus} status
 * @property {Entry | null} recorded   Your own punch or entry, raw.
 * @property {Entry | null} actual     The official timesheet. Present = verified.
 * @property {string | null} note
 * @property {string} [updatedAt]      ISO timestamp.
 *
 * @typedef {object} Holiday
 * @property {string} date
 * @property {string} name
 *
 * @typedef {"down" | "up" | "nearest" | "custom" | "none"} RoundingMode
 *
 * @typedef {object} RoundingRule
 * @property {RoundingMode} mode
 * @property {number} [grace]  Minutes; used by "custom".
 *
 * @typedef {"tracking" | "calendar"} Grouping
 *
 * @typedef {object} WorkdaysOverride
 * @property {string} key    Group month "YYYY-MM" it applies to.
 * @property {number} value
 *
 * @typedef {object} Settings
 * @property {Grouping} grouping
 * @property {RoundingRule} roundIn
 * @property {RoundingRule} roundOut
 * @property {number} target             Target daily average, hours.
 * @property {WorkdaysOverride | null} workdaysOverride
 * @property {number} releaseDay         Weekday the timesheet is published (0 = Sunday).
 *
 * @typedef {object} Resolved
 *   What a day contributes to the numbers.
 * @property {boolean} verified
 * @property {boolean} open     Clocked in, not yet out.
 * @property {Entry} entry      The entry used (timesheet, or predicted from your punch).
 * @property {number | null} work
 * @property {number | null} pto
 * @property {number | null} total  work + pto
 *
 * @typedef {object} MonthStat
 * @property {string} key            Group month "YYYY-MM".
 * @property {number} total          Sum of counted hours.
 * @property {number} counted        Days in the average.
 * @property {number | null} avg
 * @property {number} present
 * @property {number} denom          Weekdays counted for presence.
 * @property {number} wfh
 * @property {number | null} presencePct
 * @property {number} unverified     Unverified days in the month (up to today).
 * @property {number} unverifiedAvg  ...of which are in the average.
 * @property {boolean} partial       The month containing today.
 *
 * @typedef {object} Backup
 * @property {"rto"} app
 * @property {number} version
 * @property {Day[]} days
 * @property {Holiday[]} holidays
 * @property {Settings} settings
 * @property {string | null} [createdAt]
 * @property {string | null} [lastExportAt]
 * @property {string} [exportedAt]
 */

export {};
