/**
 * Application state and every write to it.
 *
 *   data - the persisted document: days, holidays, settings
 *   ui   - session state: clock, selections, toast
 *
 * Lume tracks top-level keys only, so arrays and objects are always
 * replaced, never mutated in place.
 */
/** @import { Day, DayStatus, Entry, Holiday, Settings } from "../domain/types.js" */
/** @import { PersistState, SaveTarget } from "./persistence.js" */
import { effect, state } from "lume-js";
import { DEFAULT_SETTINGS, STATUSES, STATUS_LABEL } from "../domain/constants.js";
import { toDateKey } from "../domain/dates.js";
import { EMPTY_ENTRY, isOpen, predictEntry } from "../domain/days.js";
import { buildBackup, parseImport } from "../domain/backup.js";
import { fromMinutes, round2, timeOf, toMinutes } from "../domain/time.js";
import { deleteDocument, loadDocument, requestPersistence, saveDocument } from "./persistence.js";
import { formatTime } from "../lib/format.js";

const SAVE_DEBOUNCE_MS = 120;
const TOAST_MS = 2600;

/**
 * @typedef {object} DataState
 * @property {boolean} loaded
 * @property {Day[]} days  Newest first.
 * @property {Holiday[]} holidays
 * @property {Settings} settings
 * @property {string | null} lastExportAt
 * @property {string | null} createdAt
 * @property {SaveTarget | ""} storage
 * @property {PersistState | ""} persist
 */

/** @type {DataState} */
const initialData = {
  loaded: false,
  days: [],
  holidays: [],
  settings: { ...DEFAULT_SETTINGS },
  lastExportAt: null,
  createdAt: null,
  storage: "",
  persist: "",
};
export const data = state(initialData);

/**
 * @typedef {"week" | "month" | "all"} HistoryFilter
 * @typedef {"month" | "year"} ChartGroup
 *
 * @typedef {object} UiState
 * @property {number} nowMs
 * @property {string} today
 * @property {HistoryFilter} filter
 * @property {ChartGroup} chartGroup
 * @property {string | null} monthSel  null = follow today
 * @property {string | null} yearSel   null = follow the selected month
 * @property {string} toast
 */

const now = new Date();
/** @type {UiState} */
const initialUi = {
  nowMs: now.getTime(),
  today: toDateKey(now),
  filter: "month",
  chartGroup: "month",
  monthSel: null,
  yearSel: null,
  toast: "",
};
export const ui = state(initialUi);

// ---------------------------------------------------------------- persistence

/** @type {ReturnType<typeof setTimeout> | undefined} */
let saveTimer;
/** @type {object | null} */
let pendingDoc = null;

/** Write any pending change now (call before the app is backgrounded). */
export async function flush() {
  clearTimeout(saveTimer);
  if (!pendingDoc) return;
  const doc = pendingDoc;
  pendingDoc = null;
  data.storage = await saveDocument(doc);
}

effect(() => {
  if (!data.loaded) return;
  pendingDoc = {
    app: "rto",
    days: data.days,
    holidays: data.holidays,
    settings: data.settings,
    lastExportAt: data.lastExportAt,
    createdAt: data.createdAt,
  };
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flush, SAVE_DEBOUNCE_MS);
});

/** @param {Day[]} days */
const newestFirst = (days) => [...days].sort((a, b) => b.date.localeCompare(a.date));

export async function loadState() {
  const doc = await loadDocument();
  /** @type {import("../domain/backup.js").ParsedImport | null} */
  let parsed = null;
  try {
    parsed = doc ? parseImport(doc) : null;
  } catch {
    // Unreadable document: start empty rather than crash.
  }
  const meta = /** @type {{ lastExportAt?: unknown, createdAt?: unknown } | null} */ (doc);
  data.days = newestFirst(parsed?.days ?? []);
  data.holidays = parsed?.holidays ?? [];
  data.settings = { ...DEFAULT_SETTINGS, ...(parsed?.settings ?? {}) };
  data.lastExportAt = typeof meta?.lastExportAt === "string" ? meta.lastExportAt : null;
  data.createdAt = typeof meta?.createdAt === "string" ? meta.createdAt : new Date().toISOString();
  data.loaded = true;
  data.persist = await requestPersistence();
}

// ---------------------------------------------------------------- feedback

/** @type {ReturnType<typeof setTimeout> | undefined} */
let toastTimer;

/** @param {string} message */
export function toast(message) {
  ui.toast = message;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    ui.toast = "";
  }, TOAST_MS);
}

// ---------------------------------------------------------------- days

/** @param {string} date */
export const findDay = (date) => data.days.find((d) => d.date === date) ?? null;

export const findOpenDay = () => data.days.find(isOpen) ?? null;

/**
 * Insert or replace a day. `replaceDate` removes the old record when an
 * edit moves a day to a new date.
 * @param {Omit<Day, "updatedAt">} day
 * @param {string | null} [replaceDate]
 */
export function saveDay(day, replaceDate = null) {
  /** @type {Day} */
  const clean = {
    date: day.date,
    status: STATUSES.includes(day.status) ? day.status : "office",
    recorded: day.recorded,
    actual: day.actual,
    note: day.note?.trim() || null,
    updatedAt: new Date().toISOString(),
  };
  const rest = data.days.filter((d) => d.date !== clean.date && d.date !== replaceDate);
  data.days = newestFirst([...rest, clean]);
}

/** @param {string} date */
export function deleteDay(date) {
  data.days = data.days.filter((d) => d.date !== date);
}

/** Clock in, or clock out of the open day. */
export async function punch() {
  const open = findOpenDay();
  if (open?.recorded) {
    let end = timeOf(new Date());
    // A same-minute tap would be a zero-length shift.
    if (end === open.recorded.start) end = fromMinutes(toMinutes(end) + 1);
    saveDay({ ...open, recorded: { ...open.recorded, end } });
    toast(`Clocked out at ${formatTime(end)}`);
  } else {
    const today = toDateKey(new Date());
    const existing = findDay(today);
    if (existing?.recorded?.start) {
      toast("Today already has a clock-in. Edit the day instead.");
      return;
    }
    const start = timeOf(new Date());
    saveDay({
      date: today,
      status: "office",
      recorded: { ...EMPTY_ENTRY, start, pto: existing?.recorded?.pto ?? null },
      actual: existing?.actual ?? null,
      note: existing?.note ?? null,
    });
    toast(`Clocked in at ${formatTime(start)}`);
  }
  await flush();
}

/**
 * Quick day type for today from the home screen.
 * @param {DayStatus} status
 */
export function setTodayStatus(status) {
  const existing = findDay(ui.today);
  if (status === "office") {
    if (existing && !existing.recorded && !existing.actual) deleteDay(ui.today);
    else if (existing) saveDay({ ...existing, status });
    return;
  }
  saveDay({ ...(existing ?? { date: ui.today, recorded: null, actual: null, note: null }), status });
  toast(`Today marked ${STATUS_LABEL[status]}`);
}

// ---------------------------------------------------------------- verification

/**
 * The timesheet values the rounding rules predict for an entry.
 * @param {Entry | null} recorded
 * @returns {Entry}
 */
export function predictedTimesheet(recorded) {
  const p = predictEntry(recorded, data.settings);
  if (!p) return { ...EMPTY_ENTRY };
  return { ...p, hours: p.hours === null ? null : round2(p.hours) };
}

/**
 * Mark days as matching the predicted timesheet.
 * @param {string[]} dates
 */
export function verifyAsPredicted(dates) {
  const set = new Set(dates);
  const at = new Date().toISOString();
  data.days = data.days.map((d) => (set.has(d.date) && !d.actual ? { ...d, actual: predictedTimesheet(d.recorded), updatedAt: at } : d));
  toast(dates.length === 1 ? "Marked as matching the timesheet" : `${dates.length} days marked as matching`);
}

// ---------------------------------------------------------------- settings

/** @param {Partial<Settings>} patch */
export function updateSettings(patch) {
  data.settings = { ...data.settings, ...patch };
}

/** @param {Holiday[]} list */
export function setHolidays(list) {
  data.holidays = list;
}

// ---------------------------------------------------------------- backup

export function backupJson() {
  return JSON.stringify(buildBackup(data), null, 2);
}

export function markExported() {
  data.lastExportAt = new Date().toISOString();
}

/**
 * Merge a backup into the device data. Days with the same date are replaced.
 * @param {string} json
 */
export function importBackup(json) {
  /** @type {unknown} */
  let parsed;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error("That file is not valid JSON.");
  }
  const imp = parseImport(parsed);
  if (!imp.days.length && !imp.holidays.length) throw new Error("No days found in that file.");

  const at = new Date().toISOString();
  const days = new Map(data.days.map((d) => [d.date, d]));
  for (const d of imp.days) days.set(d.date, { ...d, updatedAt: at });
  data.days = newestFirst([...days.values()]);

  if (imp.holidays.length) {
    const holidays = new Map(data.holidays.map((h) => [h.date, h]));
    for (const h of imp.holidays) holidays.set(h.date, h);
    data.holidays = [...holidays.values()].sort((a, b) => a.date.localeCompare(b.date));
  }
  updateSettings(imp.settings);
  return { days: imp.days.length, holidays: imp.holidays.length, skipped: imp.skipped };
}

export async function eraseEverything() {
  await deleteDocument();
  data.days = [];
  data.holidays = [];
  data.settings = { ...DEFAULT_SETTINGS };
  data.lastExportAt = null;
  await flush();
}
