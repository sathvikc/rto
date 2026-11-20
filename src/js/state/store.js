/**
 * Application state and every write to it.
 *
 *   data - the persisted document: days (holidays included) and settings
 *   ui   - session state: clock, selections, toast
 *
 * Lume tracks top-level keys only, so arrays and objects are always
 * replaced, never mutated in place.
 */
/** @import { Day, DayStatus, Entry, Settings } from "../domain/types.js" */
/** @import { PersistState, SaveTarget } from "./persistence.js" */
import { batch, effect, state } from "lume-js";
import { DEFAULT_SETTINGS, STATUSES, STATUS_LABEL } from "../domain/constants.js";
import { toDateKey } from "../domain/dates.js";
import { EMPTY_ENTRY, isBlankDay, isOpen, predictEntry, unmatchDay, unverifyFuture } from "../domain/days.js";
import { buildBackup, copyHolidays, holidayDay, mergeDays, parseImport } from "../domain/backup.js";
import { fromMinutes, round2, timeOf, toMinutes } from "../domain/time.js";
import { deleteDocument, loadDocument, requestPersistence, saveDocument } from "./persistence.js";
import { formatTime } from "../lib/format.js";

const SAVE_DEBOUNCE_MS = 120;
const TOAST_MS = 2600;
const TOAST_WITH_ACTIONS_MS = 6000;

/**
 * @typedef {object} DataState
 * @property {boolean} loaded
 * @property {Day[]} days  Newest first.
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
  settings: { ...DEFAULT_SETTINGS },
  lastExportAt: null,
  createdAt: null,
  storage: "",
  persist: "",
};

export const data = state(initialData);

/**
 * @typedef {"home" | "history" | "settings"} Tab
 * @typedef {"week" | "month" | "all"} HistoryFilter
 * @typedef {"month" | "year"} ChartGroup
 * @typedef {"undo" | "adjust" | "reload"} ToastAction
 *
 * @typedef {object} UiState
 * @property {Tab} tab
 * @property {number} nowMs
 * @property {string} today
 * @property {HistoryFilter} filter
 * @property {ChartGroup} chartGroup
 * @property {string | null} monthSel  null = follow today
 * @property {string | null} yearSel   null = follow the selected month
 * @property {boolean} verifiedOnly    History shows timesheet-verified days only
 * @property {string} toast
 * @property {ToastAction[]} toastActions
 */

const now = new Date();

/** @type {UiState} */
const initialUi = {
  tab: "home",
  nowMs: now.getTime(),
  today: toDateKey(now),
  filter: "month",
  chartGroup: "month",
  monthSel: null,
  yearSel: null,
  verifiedOnly: false,
  toast: "",
  toastActions: [],
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

  data.days = newestFirst((parsed?.days ?? []).map((d) => unverifyFuture(d, toDateKey(new Date()))));
  data.settings = { ...DEFAULT_SETTINGS, ...(parsed?.settings ?? {}) };
  data.lastExportAt = typeof meta?.lastExportAt === "string" ? meta.lastExportAt : null;
  data.createdAt = typeof meta?.createdAt === "string" ? meta.createdAt : new Date().toISOString();
  data.loaded = true;
  data.persist = await requestPersistence();
}

// ---------------------------------------------------------------- feedback

/** @type {ReturnType<typeof setTimeout> | undefined} */
let toastTimer;

/**
 * Show a short message, optionally with action buttons (which stay longer,
 * so there is time to tap them).
 * @param {string} message
 * @param {ToastAction[]} [actions]
 * @param {number} [durationMs]  Override how long it stays.
 */
export function toast(message, actions = [], durationMs) {
  batch(() => {
    ui.toast = message;
    ui.toastActions = actions;
  });

  clearTimeout(toastTimer);

  toastTimer = setTimeout(dismissToast, durationMs ?? (actions.length ? TOAST_WITH_ACTIONS_MS : TOAST_MS));
}

export function dismissToast() {
  clearTimeout(toastTimer);

  batch(() => {
    ui.toast = "";
    ui.toastActions = [];
  });
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

// ---------------------------------------------------------------- punches

/**
 * The record a punch replaced, so the toast's Undo can put it back.
 * @type {{ date: string, before: Day | null } | null}
 */
let lastPunch = null;

/** @param {string} date */
function rememberForUndo(date) {
  lastPunch = { date, before: findDay(date) };
}

/** Revert the most recent punch or punch-time change. */
export function undoLastPunch() {
  if (!lastPunch) return;

  const { date, before } = lastPunch;

  lastPunch = null;

  if (before) saveDay(before);
  else deleteDay(date);

  toast("Undone");
}

/**
 * Clock in today at `time` (default now).
 * @param {string} [time] "HH:MM"
 * @returns {string | null} error message
 */
export function clockIn(time = timeOf(new Date())) {
  const today = toDateKey(new Date());
  const existing = findDay(today);

  if (findOpenDay()) return "You are still clocked in. Clock out first.";

  if (existing?.recorded?.start) return "Today already has a clock-in. Edit the day instead.";

  rememberForUndo(today);

  saveDay({
    date: today,
    status: "office",
    recorded: { ...EMPTY_ENTRY, start: time, pto: existing?.recorded?.pto ?? null },
    actual: existing?.actual ?? null,
    note: existing?.note ?? null,
  });

  toast(`Clocked in at ${formatTime(time)}`, ["undo", "adjust"]);

  return null;
}

/**
 * Clock out of the open shift at `time` (default now).
 * @param {string} [time] "HH:MM"
 * @returns {string | null} error message
 */
export function clockOut(time) {
  const open = findOpenDay();

  if (!open?.recorded?.start) return "You are not clocked in.";

  let end = time ?? timeOf(new Date());

  if (end === open.recorded.start) {
    // A same-minute tap would be a zero-length shift.
    if (time) return "Clock-out must differ from clock-in.";

    end = fromMinutes(toMinutes(end) + 1);
  }

  // A chosen time is on the shift's own day (no overnight shifts by hand).
  if (time && toMinutes(end) < toMinutes(open.recorded.start)) {
    return `Clock-out must be after ${formatTime(open.recorded.start)}.`;
  }

  rememberForUndo(open.date);
  saveDay({ ...open, recorded: { ...open.recorded, end } });
  toast(`Clocked out at ${formatTime(end)}`, ["undo", "adjust"]);

  return null;
}

/**
 * Change when the open shift (or today's shift) started.
 * @param {string} time "HH:MM"
 * @returns {string | null} error message
 */
export function setStartTime(time) {
  const day = findOpenDay() ?? findDay(toDateKey(new Date()));

  if (!day?.recorded?.start) return "There is no clock-in to change.";

  if (day.recorded.end && toMinutes(time) >= toMinutes(day.recorded.end)) {
    return `Clock-in must be before ${formatTime(day.recorded.end)}.`;
  }

  rememberForUndo(day.date);
  saveDay({ ...day, recorded: { ...day.recorded, start: time } });
  toast(`Clock-in set to ${formatTime(time)}`, ["undo"]);

  return null;
}

/**
 * Change today's clock-out (after a punch).
 * @param {string} time "HH:MM"
 * @returns {string | null} error message
 */
export function setEndTime(time) {
  const day = findDay(toDateKey(new Date()));

  if (!day?.recorded?.start || !day.recorded.end) return "There is no clock-out to change.";

  if (toMinutes(time) <= toMinutes(day.recorded.start)) return `Clock-out must be after ${formatTime(day.recorded.start)}.`;

  rememberForUndo(day.date);
  saveDay({ ...day, recorded: { ...day.recorded, end: time } });
  toast(`Clock-out set to ${formatTime(time)}`, ["undo"]);

  return null;
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

/**
 * Matches toggle on a day card: match against the predicted timesheet, or
 * undo the match.
 * @param {string} date
 */
export function toggleMatch(date) {
  const day = findDay(date);

  if (!day) return;

  if (day.actual) {
    saveDay(unmatchDay(day));
    toast("Match removed");
  } else {
    verifyAsPredicted([date]);
  }
}

// ---------------------------------------------------------------- settings

/** @param {Partial<Settings>} patch */
export function updateSettings(patch) {
  data.settings = { ...data.settings, ...patch };
}

// ---------------------------------------------------------------- holidays

/**
 * Add a company holiday as a Holiday day. A date you already logged keeps
 * your record.
 * @param {string} date
 * @param {string} name
 * @returns {string | null} error message
 */
export function addHoliday(date, name) {
  const existing = findDay(date);

  if (existing && !isBlankDay(existing)) return `${date} already has an entry. Edit that day instead.`;

  saveDay(holidayDay(date, name));

  return null;
}

/**
 * Change a holiday's date or name.
 * @param {string} date  Current date.
 * @param {{ date?: string, name?: string }} change
 * @returns {string | null} error message
 */
export function updateHoliday(date, change) {
  const day = findDay(date);

  if (day?.status !== "holiday") return "That holiday no longer exists.";

  const nextDate = change.date ?? date;
  const target = nextDate === date ? null : findDay(nextDate);

  if (target && !isBlankDay(target)) return `${nextDate} already has an entry.`;

  saveDay(holidayDay(nextDate, change.name ?? day.note ?? ""), nextDate === date ? null : date);

  return null;
}

/**
 * Copy one year's holidays to another (same month/day and names).
 * @param {string} fromYear
 * @param {string} toYear
 * @returns {number} how many were added
 */
export function copyHolidaysToYear(fromYear, toYear) {
  const added = copyHolidays(data.days, fromYear, toYear);

  if (added.length) {
    const at = new Date().toISOString();

    data.days = mergeDays(
      data.days,
      added.map((d) => ({ ...d, updatedAt: at })),
    ).days;
  }

  return added.length;
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

  if (!imp.days.length) throw new Error("No days found in that file.");

  // The file wins: its days replace local days with the same date.
  const at = new Date().toISOString();
  const today = toDateKey(new Date());
  const incoming = imp.days.map((d) => unverifyFuture({ ...d, updatedAt: at }, today));
  const merged = mergeDays(data.days, incoming);

  data.days = merged.days;

  updateSettings(imp.settings);

  return { added: merged.added, replaced: merged.replaced, holidays: imp.holidays, skipped: imp.skipped };
}

export async function eraseEverything() {
  await deleteDocument();
  data.days = [];
  data.settings = { ...DEFAULT_SETTINGS };
  data.lastExportAt = null;
  await flush();
}
