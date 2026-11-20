/** @import { Backup, Day, DayStatus, Entry, Holiday, RoundingRule, Settings } from "./types.js" */
import { BACKUP_VERSION, STATUSES } from "./constants.js";
import { isDateKey } from "./dates.js";
import { isTime, round2 } from "./time.js";

const ROUNDING_MODES = ["down", "up", "nearest", "custom", "none"];

/** @param {unknown} v */
const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** @param {unknown} v */
const time = (v) => (isTime(v) ? v : null);

/** @param {unknown} v */
const text = (v) => (typeof v === "string" && v.trim() ? v.trim() : null);

/** @param {unknown} v @returns {v is Record<string, unknown>} */
const isObject = (v) => typeof v === "object" && v !== null && !Array.isArray(v);

/**
 * @param {unknown} v
 * @returns {Entry | null}
 */
function entryFrom(v) {
  if (!isObject(v)) return null;

  return { start: time(v.start), end: time(v.end), hours: num(v.hours), pto: num(v.pto) };
}

/**
 * @param {unknown} v
 * @returns {RoundingRule | null}
 */
function ruleFrom(v) {
  if (!isObject(v) || typeof v.mode !== "string" || !ROUNDING_MODES.includes(v.mode)) return null;

  const rule = /** @type {RoundingRule} */ ({ mode: v.mode });

  if (num(v.grace) !== null) rule.grace = /** @type {number} */ (v.grace);

  return rule;
}

/**
 * Row in this app's format.
 * @param {Record<string, unknown>} raw
 * @param {string} date
 * @returns {Day}
 */
function dayFromBackup(raw, date) {
  const status = /** @type {DayStatus} */ (STATUSES.includes(/** @type {DayStatus} */ (raw.status)) ? raw.status : "office");

  return { date, status, recorded: entryFrom(raw.recorded), actual: entryFrom(raw.actual), note: text(raw.note) };
}

/**
 * Flat row (date, start_time, end_time, hours, pto_hours, hours_with_pto,
 * source). Timesheet rows become verified; punches (source "app") stay
 * unverified and keep raw times only.
 * @param {Record<string, unknown>} raw
 * @param {string} date
 * @returns {Day}
 */
function dayFromFlatRow(raw, date) {
  const pto = num(raw.pto_hours);
  const withPto = num(raw.hours_with_pto);
  let hours = num(raw.hours);

  if (hours === null && withPto !== null) hours = round2(withPto - (pto ?? 0));

  /** @type {Entry} */
  const entry = { start: time(raw.start_time), end: time(raw.end_time), hours, pto };
  const isPunch = raw.source === "app";

  if (isPunch && entry.start && entry.end) entry.hours = null;

  const ptoOnly = hours === null && pto !== null && !entry.start;

  return {
    date,
    status: ptoOnly ? "ooo" : "office",
    recorded: isPunch ? entry : null,
    actual: isPunch ? null : entry,
    note: null,
  };
}

/**
 * @typedef {object} ParsedImport
 * @property {Day[]} days
 * @property {Holiday[]} holidays
 * @property {Partial<Settings>} settings
 * @property {number} skipped  Rows without a valid date.
 */

/**
 * Validates and normalizes an imported JSON document. Accepts this app's
 * backups and arrays/objects of flat rows.
 * @param {unknown} json
 * @returns {ParsedImport}
 */
export function parseImport(json) {
  const rows = Array.isArray(json) ? json : isObject(json) && Array.isArray(json.days) ? json.days : null;

  if (!rows) throw new Error("No days found in that file.");

  /** @type {ParsedImport} */
  const out = { days: [], holidays: [], settings: {}, skipped: 0 };

  for (const raw of rows) {
    if (!isObject(raw) || !isDateKey(raw.date)) {
      out.skipped++;
      continue;
    }

    const isBackupRow = "recorded" in raw || "actual" in raw || "status" in raw;

    out.days.push(isBackupRow ? dayFromBackup(raw, raw.date) : dayFromFlatRow(raw, raw.date));
  }

  if (isObject(json)) {
    if (Array.isArray(json.holidays)) {
      out.holidays = json.holidays
        .filter((h) => isObject(h) && isDateKey(h.date))
        .map((h) => ({ date: /** @type {string} */ (h.date), name: text(h.name) ?? "" }));
    }

    if (isObject(json.settings)) out.settings = settingsFrom(json.settings);
  }

  return out;
}

/**
 * The importable subset of settings, validated.
 * @param {Record<string, unknown>} s
 * @returns {Partial<Settings>}
 */
function settingsFrom(s) {
  /** @type {Partial<Settings>} */
  const out = {};

  if (s.grouping === "tracking" || s.grouping === "calendar") out.grouping = s.grouping;

  const roundIn = ruleFrom(s.roundIn);
  const roundOut = ruleFrom(s.roundOut);

  if (roundIn) out.roundIn = roundIn;
  if (roundOut) out.roundOut = roundOut;

  const target = num(s.target);

  if (target !== null && target > 0 && target <= 24) out.target = target;

  const release = num(s.releaseDay);

  if (release !== null && Number.isInteger(release) && release >= 0 && release <= 6) out.releaseDay = release;

  const override = s.workdaysOverride;

  if (override === null) out.workdaysOverride = null;
  else if (isObject(override) && typeof override.key === "string" && num(override.value) !== null) {
    out.workdaysOverride = { key: override.key, value: /** @type {number} */ (override.value) };
  }

  return out;
}

/**
 * @param {{ days: Day[], holidays: Holiday[], settings: Settings, createdAt: string | null }} doc
 * @returns {Backup}
 */
export function buildBackup({ days, holidays, settings, createdAt }) {
  return {
    app: "rto",
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    createdAt,
    settings,
    holidays,
    days: [...days].sort((a, b) => a.date.localeCompare(b.date)),
  };
}

/**
 * "2026-11-26 Thanksgiving" per line -> sorted, de-duplicated holidays.
 * @param {string} input
 * @returns {{ list: Holiday[], invalid: number }}
 */
export function parseHolidays(input) {
  /** @type {Map<string, string>} */
  const byDate = new Map();
  let invalid = 0;

  for (const line of input.split(/\r?\n/)) {
    const trimmed = line.trim();

    if (!trimmed) continue;

    const match = trimmed.match(/^(\d{4}-\d{2}-\d{2})\s*[,\-–:|]?\s*(.*)$/);

    if (!match || !isDateKey(match[1])) {
      invalid++;
      continue;
    }

    byDate.set(match[1], match[2].trim());
  }

  const list = [...byDate.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, name]) => ({ date, name }));

  return { list, invalid };
}

/** @param {Holiday[]} list */
export const holidaysToText = (list) => list.map((h) => (h.name ? `${h.date} ${h.name}` : h.date)).join("\n");

/**
 * Replace one year's holidays with `list`, keeping every other year. Lines
 * dated in another year are merged into that year (same date replaced).
 * @param {Holiday[]} existing
 * @param {string} year "YYYY"
 * @param {Holiday[]} list
 * @returns {Holiday[]} sorted
 */
export function replaceHolidaysForYear(existing, year, list) {
  /** @type {Map<string, Holiday>} */
  const byDate = new Map(existing.filter((h) => !h.date.startsWith(`${year}-`)).map((h) => [h.date, h]));

  for (const h of list) byDate.set(h.date, h);

  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Merge imported days into local ones. The file wins: a day in the file
 * replaces the local day with the same date; local days not in the file
 * are kept.
 * @param {Day[]} local
 * @param {Day[]} incoming
 * @returns {{ days: Day[], added: number, replaced: number }} days newest first
 */
export function mergeDays(local, incoming) {
  const byDate = new Map(local.map((d) => [d.date, d]));
  let added = 0;
  let replaced = 0;

  for (const day of incoming) {
    if (byDate.has(day.date)) replaced++;
    else added++;

    byDate.set(day.date, day);
  }

  return { days: [...byDate.values()].sort((a, b) => b.date.localeCompare(a.date)), added, replaced };
}
