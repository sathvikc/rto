// Pure date, rounding and stats math. No DOM, no storage, no Lume:
// everything on screen is derived from the day records and settings
// through these functions, so cards, charts and history never disagree.
// Runs in the browser and in Node (tests/calc.test.mjs).

export const STEP = 15; // minutes; timesheet rounding grid
export const STATUSES = ["office", "wfh", "ooo", "sick"];
export const STATUS_LABEL = { office: "Office", wfh: "WFH", ooo: "OOO", sick: "Sick" };

// ---------- dates ----------
export const pad = (n) => String(n).padStart(2, "0");
export const dateKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export function parseKey(key) {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}
export function addDays(key, n) {
  const d = parseKey(key);
  d.setDate(d.getDate() + n);
  return dateKey(d);
}
export const dow = (key) => parseKey(key).getDay();
export const isWeekday = (key) => { const w = dow(key); return w >= 1 && w <= 5; };
export const weekStartSunday = (key) => addDays(key, -dow(key));
export function weekStartMonday(key) {
  const w = dow(key);
  return addDays(key, w === 0 ? -6 : 1 - w);
}

// Tracking month = month of the week's Sunday, so a week that straddles a
// month boundary belongs entirely to the earlier month (the timesheet's
// grouping). Calendar month = the date's own month.
export function groupKey(key, grouping) {
  return grouping === "calendar" ? key.slice(0, 7) : weekStartSunday(key).slice(0, 7);
}

// ---------- times ----------
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
export const isTime = (t) => typeof t === "string" && TIME_RE.test(t);
export function toMins(t) {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}
export function fromMins(mins) {
  const w = ((mins % 1440) + 1440) % 1440;
  return `${pad(Math.floor(w / 60))}:${pad(w % 60)}`;
}
export function fmtTime(t) {
  if (!t) return "—";
  const [h, m] = t.split(":").map(Number);
  return `${h % 12 === 0 ? 12 : h % 12}:${pad(m)} ${h >= 12 ? "PM" : "AM"}`;
}
export function fmtHours(h, digits) {
  if (h === null || h === undefined || Number.isNaN(h)) return "—";
  if (digits !== undefined) return `${h.toFixed(digits)}h`;
  // Quarter-hour values keep their precision (7.75h); anything else 1 dp.
  const r = Math.round(h * 100) / 100;
  return `${Number.isInteger(r * 4) ? String(r) : r.toFixed(1)}h`;
}

// ---------- rounding ----------
// A rule is { mode, grace }. Every mode is "round down when the minutes past
// the last quarter are <= grace, otherwise round up":
//   down = grace 14, up = grace 0, nearest = grace 7, custom = your number.
// Example, clock-out custom grace 4: 4:16-4:19 -> 4:15, 4:20-4:29 -> 4:30.
export function graceOf(rule) {
  switch (rule?.mode) {
    case "down": return STEP - 1;
    case "up": return 0;
    case "nearest": return Math.floor(STEP / 2);
    case "custom": return Math.max(0, Math.min(STEP - 1, Number(rule.grace) || 0));
    default: return null; // "none"
  }
}
export function roundMins(mins, rule) {
  const g = graceOf(rule);
  if (g === null) return mins;
  const past = mins % STEP;
  if (past === 0) return mins;
  return past <= g ? mins - past : mins - past + STEP;
}
export const roundTime = (t, rule) => fromMins(roundMins(toMins(t), rule));

// Duration between two HH:MM times. End before start = overnight shift.
// Equal times mean "no duration" (null), never a 0-hour day.
export function spanHours(start, end) {
  if (!isTime(start) || !isTime(end)) return null;
  let s = toMins(start), e = toMins(end);
  if (e === s) return null;
  if (e < s) e += 1440;
  return (e - s) / 60;
}

// ---------- entries ----------
// A day has up to two entries of the same shape { start, end, hours, pto }:
//   recorded = what you punched or typed (raw, unrounded)
//   actual   = what the official timesheet shows (already rounded by the
//              employer). Present => the day is verified.
// Calculations use actual when present, otherwise recorded with the
// rounding settings applied (a prediction, marked with *).
export function predicted(entry, settings) {
  if (!entry) return null;
  if (isTime(entry.start) && isTime(entry.end)) {
    const start = roundTime(entry.start, settings.roundIn);
    const end = roundTime(entry.end, settings.roundOut);
    return { start, end, hours: spanHours(start, end), pto: entry.pto ?? null };
  }
  return { start: entry.start ?? null, end: entry.end ?? null, hours: entry.hours ?? null, pto: entry.pto ?? null };
}

export function isOpen(day) {
  const r = day.recorded;
  return !!r && isTime(r.start) && !r.end && (r.hours === null || r.hours === undefined);
}

// The numbers a day contributes, plus where they came from.
export function resolve(day, settings) {
  const verified = !!day.actual;
  let entry;
  if (verified) {
    const a = day.actual;
    const span = spanHours(a.start, a.end);
    entry = { start: a.start ?? null, end: a.end ?? null, hours: a.hours ?? span, pto: a.pto ?? null };
  } else {
    entry = predicted(day.recorded, settings) ?? { start: null, end: null, hours: null, pto: null };
  }
  const open = isOpen(day) && !verified;
  const work = open ? null : entry.hours;
  const pto = entry.pto;
  const total = work === null && pto === null ? null : (work ?? 0) + (pto ?? 0);
  return { verified, open, entry, work, pto, total };
}

export const isHoliday = (key, holidaySet) => holidaySet.has(key);

// Average hours counts office days with work hours (work + PTO, as the
// timesheet's "hours with PTO"). PTO-only, WFH and blank days are left out.
export function countsInAverage(day, r) {
  return day.status !== "wfh" && r.work !== null;
}

// Presence: WFH = 0; OOO and Sick = 1; office = 1 when the day has any
// hours or PTO (or is in progress), else 0.
export function presenceOf(day, r) {
  if (day.status === "wfh") return 0;
  if (day.status === "ooo" || day.status === "sick") return 1;
  return r.work !== null || r.pto !== null || r.open ? 1 : 0;
}

// ---------- monthly stats ----------
// Presence % = present days / Mon-Fri weekdays of the weeks that have at
// least one record in the group, minus company holidays and future days.
// A weekday with no record inside a logged week counts as absent; a week
// with no records at all is not counted.
export function monthlyStats(days, holidays, settings, todayKey) {
  const hol = new Set(holidays.map((h) => h.date));
  const groups = new Map();
  for (const d of days) {
    const k = groupKey(d.date, settings.grouping);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(d);
  }
  const currentKey = groupKey(todayKey, settings.grouping);
  const out = [];
  for (const [key, rows] of [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    let total = 0, counted = 0, unverified = 0, unverifiedAvg = 0;
    const byDate = new Map();
    for (const d of rows) {
      const r = resolve(d, settings);
      byDate.set(d.date, { d, r });
      if (countsInAverage(d, r)) {
        total += r.total;
        counted++;
        if (!r.verified) { unverified++; unverifiedAvg++; }
      } else if (!r.verified && d.date <= todayKey && (d.status !== "office" || r.pto !== null)) {
        unverified++;
      }
    }
    const weeks = new Set(rows.filter((d) => d.date <= todayKey).map((d) => weekStartSunday(d.date)));
    let denom = 0, present = 0, wfh = 0;
    for (const wk of weeks) {
      for (let i = 1; i <= 5; i++) {
        const k = addDays(wk, i);
        if (groupKey(k, settings.grouping) !== key || k > todayKey) continue;
        const rec = byDate.get(k);
        if (hol.has(k) && !(rec && rec.r.work !== null && rec.d.status === "office")) continue;
        denom++;
        if (rec) {
          present += presenceOf(rec.d, rec.r);
          if (rec.d.status === "wfh") wfh++;
        }
      }
    }
    out.push({
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
    });
  }
  return out;
}

// Workdays left in a group month that can still raise the average:
// Mon-Fri, from today on, in the group, not a company holiday, not already
// planned as WFH/OOO/Sick, and not today if today is already logged.
export function workdaysLeft(key, days, holidays, settings, todayKey) {
  const hol = new Set(holidays.map((h) => h.date));
  const byDate = new Map(days.map((d) => [d.date, d]));
  const first = `${key}-01`;
  // A tracking month runs past the calendar month's end (into the next
  // month's first days), so scan a generous window and filter by group.
  let count = 0;
  const start = todayKey > first ? todayKey : first;
  for (let k = start; k <= addDays(first, 40); k = addDays(k, 1)) {
    if (groupKey(k, settings.grouping) !== key || !isWeekday(k) || hol.has(k)) continue;
    const d = byDate.get(k);
    if (d && d.status !== "office") continue;
    if (k === todayKey && d && !isOpen(d) && (d.recorded || d.actual)) continue;
    count++;
  }
  return count;
}

export function neededAverage(stat, left, target) {
  if (left <= 0) return null;
  const total = stat?.total ?? 0;
  const counted = stat?.counted ?? 0;
  return Math.max(0, (target * (counted + left) - total) / left);
}

// ---------- timesheet verification ----------
// The official timesheet is published every `releaseDay` (default Wednesday)
// and covers through the previous Friday. Returns the last date it covers.
export function timesheetCoverage(todayKey, releaseDay = 3) {
  const back = (dow(todayKey) - releaseDay + 7) % 7;
  const release = addDays(todayKey, -back);
  return addDays(release, -((dow(release) - 5 + 7) % 7 || 7));
}

export function needsVerification(day) {
  if (day.actual || isOpen(day)) return false;
  const r = day.recorded;
  return !!r || day.status !== "office";
}

// Compare predicted rounding with the timesheet on verified days that also
// have your own punches. Returns match counts, mismatches, and the range of
// custom grace minutes consistent with every verified clock-out (and -in).
export function roundingCheck(days, settings) {
  const res = { in: { match: 0, total: 0 }, out: { match: 0, total: 0 }, mismatches: [], fit: { in: null, out: null } };
  const pairs = { in: [], out: [] };
  for (const d of days) {
    const r = d.recorded, a = d.actual;
    if (!r || !a || !isTime(r.start) || !isTime(r.end) || !isTime(a.start) || !isTime(a.end)) continue;
    const p = predicted(r, settings);
    const okIn = p.start === a.start, okOut = p.end === a.end;
    res.in.total++; res.out.total++;
    if (okIn) res.in.match++;
    if (okOut) res.out.match++;
    if (!okIn || !okOut) res.mismatches.push({ date: d.date, recorded: r, predicted: p, actual: a });
    pairs.in.push([r.start, a.start]);
    pairs.out.push([r.end, a.end]);
  }
  for (const side of ["in", "out"]) {
    let lo = 0, hi = STEP - 1, used = 0, odd = 0;
    for (const [raw, act] of pairs[side]) {
      const m = toMins(raw), past = m % STEP;
      if (past === 0) continue;
      const down = m - past, up = down + STEP, am = toMins(act);
      if (am === down) { lo = Math.max(lo, past); used++; }
      else if (am === up % 1440 || am === up) { hi = Math.min(hi, past - 1); used++; }
      else odd++;
    }
    res.fit[side] = used ? { lo, hi, ok: lo <= hi, used, odd } : null;
  }
  return res;
}

// ---------- import / export ----------
const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const time = (v) => (isTime(v) ? v : null);
function entryFrom(o) {
  if (!o || typeof o !== "object") return null;
  return { start: time(o.start), end: time(o.end), hours: num(o.hours), pto: num(o.pto) };
}

// Accepts this app's backup ({ app: "rto", days, holidays, settings }) and
// the older flat format (rows with start_time / end_time / hours /
// pto_hours / hours_with_pto / source). Older rows from a timesheet
// ("old"/"new"/"import" source) become verified; punches ("app") stay
// unverified.
export function normalizeImport(json) {
  const out = { days: [], holidays: [], settings: null, errors: 0 };
  const rows = Array.isArray(json) ? json : Array.isArray(json?.days) ? json.days : null;
  if (!rows) throw new Error("No days found in that file.");
  for (const raw of rows) {
    if (!raw || typeof raw.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(raw.date)) { out.errors++; continue; }
    if ("recorded" in raw || "actual" in raw || "status" in raw) {
      out.days.push({
        date: raw.date,
        status: STATUSES.includes(raw.status) ? raw.status : "office",
        recorded: entryFrom(raw.recorded),
        actual: entryFrom(raw.actual),
        note: typeof raw.note === "string" && raw.note ? raw.note : null,
      });
      continue;
    }
    const pto = num(raw.pto_hours);
    let hours = num(raw.hours);
    const hwp = num(raw.hours_with_pto);
    if (hours === null && hwp !== null) hours = Math.round((hwp - (pto ?? 0)) * 100) / 100;
    const entry = { start: time(raw.start_time), end: time(raw.end_time), hours, pto };
    const fromSheet = raw.source !== "app";
    // Your own punches keep raw times only; hours are derived with rounding.
    if (!fromSheet && entry.start && entry.end) entry.hours = null;
    const ptoOnly = hours === null && pto !== null && !entry.start;
    out.days.push({
      date: raw.date,
      status: ptoOnly ? "ooo" : "office",
      recorded: fromSheet ? null : entry,
      actual: fromSheet ? entry : null,
      note: null,
    });
  }
  if (json && !Array.isArray(json)) {
    if (Array.isArray(json.holidays)) {
      out.holidays = json.holidays
        .filter((h) => h && /^\d{4}-\d{2}-\d{2}$/.test(h.date))
        .map((h) => ({ date: h.date, name: typeof h.name === "string" ? h.name : "" }));
    }
    if (json.settings && typeof json.settings === "object") out.settings = json.settings;
  }
  return out;
}

// "2026-11-26 Thanksgiving" per line -> [{date, name}], sorted, de-duped.
export function parseHolidays(text) {
  const map = new Map();
  let bad = 0;
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim();
    if (!t) continue;
    const m = t.match(/^(\d{4}-\d{2}-\d{2})\s*[,\-–:|]?\s*(.*)$/);
    if (!m || Number.isNaN(parseKey(m[1]).getTime()) || dateKey(parseKey(m[1])) !== m[1]) { bad++; continue; }
    map.set(m[1], m[2].trim());
  }
  const list = [...map.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([date, name]) => ({ date, name }));
  return { list, bad };
}
export const holidaysToText = (list) => list.map((h) => `${h.date}${h.name ? " " + h.name : ""}`).join("\n");
