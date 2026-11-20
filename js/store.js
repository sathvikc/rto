// App state (Lume stores) and every write to it. Rendering lives in app.js.
//
//   data  - the persisted document: days, holidays, settings
//   ui    - session state: clock, selections, open dialog, toast
//
// Lume tracks top-level keys only, so arrays and settings are always
// replaced, never mutated in place.

import { state, effect } from "lume-js";
import * as C from "./calc.js";
import * as S from "./storage.js";

export const APP_VERSION = "1.0.0";
export const DOC_VERSION = 2;

export const DEFAULT_SETTINGS = {
  grouping: "tracking",
  roundIn: { mode: "down", grace: 0 },
  roundOut: { mode: "custom", grace: 4 },
  target: 8,
  workdaysOverride: null, // { key: "YYYY-MM", value: n } for one month only
  releaseDay: 3, // timesheet published on Wednesday, covering through Friday
};

export const data = state({
  loaded: false,
  days: [], // newest first
  holidays: [],
  settings: { ...DEFAULT_SETTINGS },
  lastExportAt: null,
  createdAt: null,
  storage: "",
  persist: "",
});

const now = new Date();
export const ui = state({
  nowMs: now.getTime(),
  today: C.dateKey(now),
  filter: "month",
  chartGroup: "month",
  monthSel: null, // null = follow today
  yearSel: null, // null = follow the selected month
  toast: "",
});

// ---------- persistence ----------
let saveTimer = null;
let pending = null;
function docOf() {
  return {
    app: "rto",
    version: DOC_VERSION,
    days: data.days,
    holidays: data.holidays,
    settings: data.settings,
    lastExportAt: data.lastExportAt,
    createdAt: data.createdAt,
  };
}
export async function flush() {
  if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
  if (!pending) return;
  const doc = pending;
  pending = null;
  data.storage = await S.save(doc);
}
effect(() => {
  if (!data.loaded) return;
  pending = { ...docOf() };
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flush, 120);
});

export async function init() {
  const doc = await S.load();
  const settings = { ...DEFAULT_SETTINGS, ...(doc?.settings ?? {}) };
  data.days = sortDays(Array.isArray(doc?.days) ? doc.days : []);
  data.holidays = Array.isArray(doc?.holidays) ? doc.holidays : [];
  data.settings = settings;
  data.lastExportAt = doc?.lastExportAt ?? null;
  data.createdAt = doc?.createdAt ?? new Date().toISOString();
  data.loaded = true;
  data.persist = await S.requestPersist();
}

// ---------- helpers ----------
const sortDays = (days) => [...days].sort((a, b) => b.date.localeCompare(a.date));
const nowHHMM = () => { const d = new Date(); return `${C.pad(d.getHours())}:${C.pad(d.getMinutes())}`; };
export const findDay = (date) => data.days.find((d) => d.date === date) ?? null;
export const openDay = () => data.days.find((d) => C.isOpen(d)) ?? null;

export function toast(msg) {
  ui.toast = msg;
  clearTimeout(toast.t);
  toast.t = setTimeout(() => { ui.toast = ""; }, 2600);
}

export function putDay(day, replaceDate = null) {
  const clean = {
    date: day.date,
    status: C.STATUSES.includes(day.status) ? day.status : "office",
    recorded: day.recorded ?? null,
    actual: day.actual ?? null,
    note: day.note || null,
    updatedAt: new Date().toISOString(),
  };
  data.days = sortDays([...data.days.filter((d) => d.date !== clean.date && d.date !== replaceDate), clean]);
}

export function deleteDay(date) {
  data.days = data.days.filter((d) => d.date !== date);
}

// ---------- punches ----------
export async function punch() {
  const open = openDay();
  if (open) {
    let end = nowHHMM();
    if (end === open.recorded.start) end = C.fromMins(C.toMins(end) + 1);
    putDay({ ...open, recorded: { ...open.recorded, end } });
    toast(`Clocked out at ${C.fmtTime(end)}`);
  } else {
    const today = C.dateKey(new Date());
    const existing = findDay(today);
    if (existing?.recorded?.start) {
      toast("Today already has a clock-in. Edit the day instead.");
      return false;
    }
    const start = nowHHMM();
    putDay({
      date: today,
      status: "office",
      recorded: { start, end: null, hours: null, pto: existing?.recorded?.pto ?? null },
      actual: existing?.actual ?? null,
      note: existing?.note ?? null,
    });
    toast(`Clocked in at ${C.fmtTime(start)}`);
  }
  await flush();
  return true;
}

export function setTodayStatus(status) {
  const today = ui.today;
  const existing = findDay(today);
  if (status === "office") {
    if (existing && !existing.recorded && !existing.actual) deleteDay(today);
    else if (existing) putDay({ ...existing, status: "office" });
    return;
  }
  putDay({ ...(existing ?? { date: today, recorded: null, actual: null, note: null }), status });
  toast(`Today marked ${C.STATUS_LABEL[status]}`);
}

// ---------- verification ----------
export function predictedActual(day) {
  const p = C.predicted(day.recorded, data.settings);
  return p ? { start: p.start, end: p.end, hours: p.hours === null ? null : round2(p.hours), pto: p.pto } : { start: null, end: null, hours: null, pto: null };
}
export function verifyAsPredicted(dates) {
  const set = new Set(dates);
  data.days = data.days.map((d) => (set.has(d.date) && !d.actual ? { ...d, actual: predictedActual(d), updatedAt: new Date().toISOString() } : d));
  toast(dates.length === 1 ? "Marked as matching the timesheet" : `${dates.length} days marked as matching`);
}
export const round2 = (n) => Math.round(n * 100) / 100;

// ---------- settings ----------
export function updateSettings(patch) {
  data.settings = { ...data.settings, ...patch };
}
export function setHolidays(list) {
  data.holidays = list;
}

// ---------- import / export ----------
export function exportJson() {
  const doc = {
    ...docOf(),
    exported_at: new Date().toISOString(),
    format: "One object per day. recorded = your own entry (raw times). actual = the official timesheet; present means verified. Times are HH:MM 24-hour; null = blank.",
  };
  delete doc.lastExportAt;
  return JSON.stringify(doc, null, 2);
}
export function markExported() {
  data.lastExportAt = new Date().toISOString();
}

export function importJson(text) {
  let json;
  try { json = JSON.parse(text); } catch { throw new Error("That file is not valid JSON."); }
  const imp = C.normalizeImport(json);
  if (!imp.days.length && !imp.holidays.length) throw new Error("No days found in that file.");
  const byDate = new Map(data.days.map((d) => [d.date, d]));
  for (const d of imp.days) byDate.set(d.date, { ...d, updatedAt: new Date().toISOString() });
  data.days = sortDays([...byDate.values()]);
  if (imp.holidays.length) {
    const h = new Map(data.holidays.map((x) => [x.date, x]));
    for (const x of imp.holidays) h.set(x.date, x);
    data.holidays = [...h.values()].sort((a, b) => a.date.localeCompare(b.date));
  }
  if (imp.settings) {
    const s = imp.settings;
    const ok = (r) => r && typeof r === "object" && typeof r.mode === "string";
    updateSettings({
      ...(s.grouping === "calendar" || s.grouping === "tracking" ? { grouping: s.grouping } : {}),
      ...(ok(s.roundIn) ? { roundIn: s.roundIn } : {}),
      ...(ok(s.roundOut) ? { roundOut: s.roundOut } : {}),
      ...(typeof s.target === "number" ? { target: s.target } : {}),
    });
  }
  return { days: imp.days.length, holidays: imp.holidays.length, skipped: imp.errors };
}

export async function wipeAll() {
  await S.wipe();
  data.days = [];
  data.holidays = [];
  data.settings = { ...DEFAULT_SETTINGS };
  data.lastExportAt = null;
  await flush();
}
