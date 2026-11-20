// UI: Lume bindings, render effects and event handlers.
import { state, effect, bindDom, batch } from "lume-js";
import { repeat } from "lume-js/addons";
import { show, classToggle } from "lume-js/handlers";
import * as C from "./calc.js";
import { barChart } from "./charts.js";
import {
  APP_VERSION, data, ui, init, flush, punch, putDay, deleteDay, findDay, openDay, toast,
  setTodayStatus, verifyAsPredicted, predictedActual, updateSettings, setHolidays,
  exportJson, markExported, importJson, wipeAll, round2,
} from "./store.js";

const $ = (sel) => document.querySelector(sel);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const monthName = (key) => `${MONTHS[Number(key.slice(5, 7)) - 1]} ${key.slice(0, 4)}`;
const dayLabel = (key, withYear = true) => {
  const d = C.parseKey(key);
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", ...(withYear ? { year: "numeric" } : {}) });
};
const seg = (items, active, action) =>
  items.map(([value, label]) => `<button type="button" aria-pressed="${value === active}" data-action="${action}" data-value="${esc(value)}">${esc(label)}</button>`).join("");
const daysAgo = (iso) => Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);

function describeRule(rule) {
  switch (rule.mode) {
    case "down": return "rounds down";
    case "up": return "rounds up";
    case "nearest": return "rounds to the nearest quarter";
    case "custom": return `rounds down up to ${C.graceOf(rule)} min past the quarter, otherwise up`;
    default: return "is not rounded";
  }
}

// ---------------- derived model ----------------
// One place computes every number the page shows; region effects below
// read from `m` and redraw only what changed.
const m = state({
  stats: [], currentKey: "", selKey: "", selStat: null, monthKeys: [],
  autoLeft: 0, left: 0, needed: null, coverage: "", toVerify: [], laterUnverified: 0,
  todayDay: null, open: null, holiday: null, holidaySet: new Set(),
});

effect(() => {
  const { days, holidays, settings, loaded } = data;
  const { today, monthSel } = ui;
  if (!loaded) return;
  const stats = C.monthlyStats(days, holidays, settings, today);
  const currentKey = C.groupKey(today, settings.grouping);
  const monthKeys = [...new Set([...stats.map((s) => s.key), currentKey])].sort().reverse();
  const selKey = monthSel && monthKeys.includes(monthSel) ? monthSel : currentKey;
  const selStat = stats.find((s) => s.key === selKey) ?? null;
  const autoLeft = C.workdaysLeft(selKey, days, holidays, settings, today);
  const ov = settings.workdaysOverride;
  const left = ov && ov.key === selKey ? ov.value : autoLeft;
  const coverage = C.timesheetCoverage(today, settings.releaseDay);
  const unverified = days.filter((d) => d.date <= today && C.needsVerification(d));
  const toVerify = unverified.filter((d) => d.date <= coverage).sort((a, b) => a.date.localeCompare(b.date));
  const holidaySet = new Set(holidays.map((h) => h.date));
  batch(() => {
    Object.assign(m, {
      stats, currentKey, selKey, selStat, monthKeys, autoLeft, left,
      needed: C.neededAverage(selStat, left, settings.target),
      coverage, toVerify, laterUnverified: unverified.length - toVerify.length,
      todayDay: days.find((d) => d.date === today) ?? null,
      open: days.find((d) => C.isOpen(d)) ?? null,
      holiday: holidays.find((h) => h.date === today) ?? null,
      holidaySet,
    });
  });
});

// ---------------- header, clock, punch ----------------
const view = state({
  dateLine: "", clockText: "", secText: "", statusLine: "", subLine: "",
  punchLabel: "Clock in", isOpen: false, punchDisabled: true, roundingNote: "", targetText: "8",
});

effect(() => {
  const d = new Date(ui.nowMs);
  const open = m.open;
  const h = d.getHours();
  view.dateLine = d.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
  view.clockText = `${h % 12 === 0 ? 12 : h % 12}:${C.pad(d.getMinutes())} ${h >= 12 ? "PM" : "AM"}`;
  view.secText = C.pad(d.getSeconds());
  if (open) {
    const startMins = C.toMins(open.recorded.start);
    const nowMins = h * 60 + d.getMinutes() + d.getSeconds() / 60 + (open.date === C.dateKey(d) ? 0 : 1440);
    view.statusLine = "On the clock";
    view.subLine = `Started ${C.fmtTime(open.recorded.start)} · ${C.fmtHours(Math.max(0, (nowMins - startMins) / 60), 1)} elapsed`;
  }
});

effect(() => {
  const open = m.open, todayDay = m.todayDay, holiday = m.holiday, loaded = data.loaded, s = data.settings;
  view.isOpen = !!open;
  view.punchLabel = open ? "Clock out" : "Clock in";
  view.punchDisabled = !loaded;
  view.roundingNote = `Timesheet prediction: clock-in ${describeRule(s.roundIn)}; clock-out ${describeRule(s.roundOut)}.`;
  if (open) return; // the ticking effect owns the status lines
  if (todayDay && todayDay.status !== "office") {
    view.statusLine = `Today: ${C.STATUS_LABEL[todayDay.status]}`;
    view.subLine = "Not an office day.";
  } else if (todayDay?.recorded?.end) {
    const r = C.resolve(todayDay, s);
    view.statusLine = "Done for today";
    view.subLine = `${C.fmtTime(todayDay.recorded.start)} → ${C.fmtTime(todayDay.recorded.end)} · ${C.fmtHours(r.work)}${r.verified ? "" : " *"}`;
  } else {
    view.statusLine = "Off the clock";
    view.subLine = holiday ? `Company holiday${holiday.name ? `: ${holiday.name}` : ""}` : "Not clocked in";
  }
});

effect(() => {
  view.targetText = String(data.settings.target);
});

effect(() => {
  const t = m.todayDay, open = m.open, el = $("#today-status");
  if (open) { el.innerHTML = ""; return; }
  if (t && t.status !== "office") {
    el.innerHTML = `<span class="dim small">Marked ${esc(C.STATUS_LABEL[t.status])} for today.</span>${t.actual ? "" : `<button type="button" class="link-btn" data-action="today-status" data-value="office">Undo</button>`}`;
    return;
  }
  if (t && (t.recorded?.start || t.actual)) { el.innerHTML = ""; return; }
  el.innerHTML = `<span class="dim small">Not in the office today?</span>
    <div class="chips">${["wfh", "ooo", "sick"].map((s) => `<button type="button" class="chip" data-action="today-status" data-value="${s}">${C.STATUS_LABEL[s]}</button>`).join("")}</div>`;
});

// ---------------- banners ----------------
effect(() => {
  const toVerify = m.toVerify, coverage = m.coverage, later = m.laterUnverified;
  const lastExport = data.lastExportAt, count = data.days.length;
  const parts = [];
  if (toVerify.length) {
    parts.push(`<div class="banner">
      <div><b>${toVerify.length} ${toVerify.length === 1 ? "day" : "days"} to check</b>
      <p class="small dim">The timesheet covers through ${esc(dayLabel(coverage, false))}.${later ? ` ${later} newer ${later === 1 ? "day waits" : "days wait"} for the next one.` : ""}</p></div>
      <button type="button" class="pill" data-action="open-verify">Review</button></div>`);
  }
  if (count > 0 && (!lastExport || daysAgo(lastExport) >= 14)) {
    parts.push(`<div class="banner muted">
      <div><b>${lastExport ? `Last backup ${daysAgo(lastExport)} days ago` : "No backup yet"}</b>
      <p class="small dim">Data lives only on this device.</p></div>
      <button type="button" class="pill" data-action="export">Export</button></div>`);
  }
  $("#verify-banner").innerHTML = parts.join("");
});

// ---------------- month select, summary, needed ----------------
effect(() => {
  const keys = m.monthKeys, sel = m.selKey, el = $("#month-select");
  el.innerHTML = keys.map((k) => `<option value="${k}"${k === sel ? " selected" : ""}>${monthName(k)}</option>`).join("");
  el.value = sel;
});

effect(() => {
  const st = m.selStat, key = m.selKey, current = m.currentKey, s = data.settings;
  if (!key) return;
  const avg = st?.avg ?? null;
  const star = st?.unverifiedAvg ? "<sup class=\"star\">*</sup>" : "";
  $("#summary").innerHTML = `
    <p class="dim">${key === current ? "This month" : monthName(key)} · daily average <span class="dim small">(${s.grouping === "tracking" ? "tracking" : "calendar"} month)</span></p>
    <p class="big">${avg === null ? "—" : C.fmtHours(avg, 1)}${avg === null ? "" : star}</p>
    <div class="stats">
      <div><span class="dim small">Office days</span><b>${st?.counted ?? 0}</b></div>
      <div><span class="dim small">Presence</span><b>${st?.presencePct === null || !st ? "—" : `${st.presencePct}%`}</b></div>
      <div><span class="dim small">WFH</span><b>${st?.wfh ?? 0}</b></div>
    </div>
    ${st && st.denom ? `<p class="dim small">${st.present} of ${st.denom} weekdays present in the weeks logged (holidays excluded).</p>` : ""}
    ${st?.unverified ? `<p class="dim small"><span class="star">*</span> ${st.unverified} ${st.unverified === 1 ? "day" : "days"} not yet verified against the timesheet${st.unverifiedAvg ? ` (${st.unverifiedAvg} in the average)` : ""}.</p>` : ""}`;
});

effect(() => {
  const needed = m.needed, left = m.left, auto = m.autoLeft, key = m.selKey, current = m.currentKey;
  const s = data.settings, st = m.selStat;
  if (!key) return;
  const overridden = s.workdaysOverride && s.workdaysOverride.key === key;
  const past = key < current;
  $("#needed").innerHTML = past
    ? `<p class="dim">${monthName(key)} is closed</p>
       <p class="big">${st?.avg === null || !st ? "—" : C.fmtHours(st.avg, 1)}</p>
       <p class="dim small">${st && st.avg !== null ? (st.avg >= s.target ? `At or above the ${s.target}h target.` : `${C.fmtHours(s.target - st.avg, 1)} under the ${s.target}h target.`) : "No office hours that month."}</p>`
    : `<div class="row between gap top-align">
        <div>
          <p class="dim">Daily average needed</p>
          <p class="big">${needed === null ? "—" : C.fmtHours(needed, 1)}</p>
        </div>
        <div class="right">
          <p class="dim">Workdays left</p>
          <div class="stepper">
            <button type="button" class="round-btn" data-action="left-dec" aria-label="Fewer workdays left">−</button>
            <b class="mono-nums">${left}</b>
            <button type="button" class="round-btn" data-action="left-inc" aria-label="More workdays left">+</button>
          </div>
          <p class="dim small">Auto ${auto}${overridden ? ` · <button type="button" class="link-btn" data-action="left-reset">Reset</button>` : ""}</p>
        </div>
      </div>
      <p class="dim small">${left > 0 ? `Average ${C.fmtHours(needed ?? 0, 1)} on the next ${left} office ${left === 1 ? "day" : "days"} to finish the month at ${s.target}h.` : "No workdays left to plan."} Auto skips weekends, holidays and days already marked WFH, OOO or Sick.</p>`;
});

// ---------------- charts ----------------
effect(() => {
  const stats = m.stats, group = ui.chartGroup, selKey = m.selKey;
  $("#chart-group").innerHTML = seg([["month", "By month"], ["year", "By year"]], group, "chart-group");
  let bars;
  if (group === "year") {
    const by = new Map();
    for (const s of stats) {
      const y = s.key.slice(0, 4);
      const a = by.get(y) ?? { total: 0, counted: 0, present: 0, denom: 0, partial: false };
      a.total += s.total; a.counted += s.counted; a.present += s.present; a.denom += s.denom; a.partial ||= s.partial;
      by.set(y, a);
    }
    bars = [...by.entries()].sort().map(([y, a]) => ({ key: y, label: y, avg: a.counted ? a.total / a.counted : null, pct: a.denom ? Math.min(100, Math.round((a.present / a.denom) * 100)) : null, partial: a.partial }));
  } else {
    const year = (selKey || m.currentKey).slice(0, 4);
    bars = stats.filter((s) => s.key.startsWith(year)).map((s) => ({ key: s.key, label: MONTHS[Number(s.key.slice(5)) - 1], avg: s.avg, pct: s.presencePct, partial: s.partial }));
  }
  const title = group === "year" ? "by year" : `by month · ${(selKey || m.currentKey).slice(0, 4)}`;
  $("#charts").innerHTML = bars.length
    ? `<div class="card chart-card"><h3>Average hours ${title}</h3>${barChart(bars.map((b) => ({ label: b.label, value: b.avg === null ? null : round2(b.avg), text: b.avg === null ? "" : b.avg.toFixed(1), partial: b.partial })), { color: "var(--accent)", ariaLabel: `Average hours ${title}` })}</div>
       <div class="card chart-card"><h3>Presence ${title}</h3>${barChart(bars.map((b) => ({ label: b.label, value: b.pct, text: b.pct === null ? "" : `${b.pct}%`, partial: b.partial })), { max: 112, color: "var(--blue)", ariaLabel: `Presence percent ${title}` })}
       <p class="dim small">Faded bar = month in progress.</p></div>`
    : `<div class="card empty"><p class="dim">Charts appear once you log a few days.</p></div>`;
});

// ---------------- history ----------------
const hist = state({ items: [] });

function dayCard(d, s, today, holidaySet, holidays) {
  const r = C.resolve(d, s);
  const rec = d.recorded, act = d.actual;
  const badges = [];
  if (d.date === today) badges.push(`<span class="badge">Today</span>`);
  if (d.status !== "office") badges.push(`<span class="badge s-${d.status}">${C.STATUS_LABEL[d.status]}</span>`);
  if (holidaySet.has(d.date)) {
    const h = holidays.find((x) => x.date === d.date);
    badges.push(`<span class="badge s-holiday">${esc(h?.name || "Holiday")}</span>`);
  }
  if (r.open) badges.push(`<span class="badge s-open">In progress</span>`);
  const shown = r.verified && (act.start || act.end) ? act : rec;
  const timeLine = shown && (shown.start || shown.end)
    ? `${C.fmtTime(shown.start)} → ${r.open ? "…" : C.fmtTime(shown.end)}`
    : d.status === "office" ? (r.total !== null ? "No times" : "No hours") : C.STATUS_LABEL[d.status];
  const star = !r.verified && d.date <= today && !r.open ? `<sup class="star" title="Not verified">*</sup>` : "";
  const total = r.total !== null ? `<span class="hours">${C.fmtHours(r.total)}${star}</span>` : star ? `<span class="hours dim">${star}</span>` : "";
  const lines = [];
  if (r.verified) {
    let l = `<span class="ok">✓ Timesheet</span>`;
    if (rec && C.isTime(rec.start) && C.isTime(rec.end) && (rec.start !== act.start || rec.end !== act.end)) l += ` · you punched ${C.fmtTime(rec.start)} → ${C.fmtTime(rec.end)}`;
    lines.push(l);
  } else if (rec && C.isTime(rec.start) && C.isTime(rec.end)) {
    const p = C.predicted(rec, s);
    lines.push(`Predicted ${C.fmtTime(p.start)} → ${C.fmtTime(p.end)} · ${C.fmtHours(p.hours)} · not verified`);
  } else if (r.open) {
    lines.push("Hours are calculated at clock-out");
  } else if (d.date <= today) {
    lines.push("Not verified");
  }
  if (r.pto !== null) lines.push(`PTO ${C.fmtHours(r.pto)}${r.work !== null ? ` · worked ${C.fmtHours(r.work)}` : ""}`);
  const canVerify = !r.verified && !r.open && d.date <= today;
  return `
    <div class="row between gap top-align">
      <h3>${esc(dayLabel(d.date))}</h3>
      <div class="badges">${badges.join("")}</div>
    </div>
    <div class="row between gap baseline">
      <p class="times">${timeLine}</p>${total}
    </div>
    ${lines.map((l) => `<p class="dim small">${l}</p>`).join("")}
    ${d.note ? `<p class="note small">${esc(d.note)}</p>` : ""}
    <div class="row gap card-actions">
      <button type="button" class="pill sm" data-action="edit-day" data-date="${d.date}">Edit</button>
      ${canVerify ? `<button type="button" class="pill sm" data-action="verify-one" data-date="${d.date}" title="Timesheet matches the prediction">Matches ✓</button>` : ""}
      <button type="button" class="pill sm danger-text" data-action="ask-delete" data-date="${d.date}">Delete</button>
    </div>`;
}

effect(() => {
  const days = data.days, s = data.settings, holidays = data.holidays;
  const filter = ui.filter, yearSel = ui.yearSel, today = ui.today;
  const selKey = m.selKey, holidaySet = m.holidaySet;
  $("#history-filter").innerHTML = seg([["week", "Week"], ["month", "Month"], ["all", "All"]], filter, "history-filter");
  const years = [...new Set(days.map((d) => d.date.slice(0, 4)))].sort().reverse();
  const year = yearSel && (yearSel === "all" || years.includes(yearSel)) ? yearSel : (selKey || today).slice(0, 4);
  const ys = $("#year-select");
  ys.innerHTML = `<option value="all">All years</option>` + years.map((y) => `<option value="${y}">${y}</option>`).join("");
  ys.value = years.includes(year) || year === "all" ? year : "all";
  ys.parentElement.querySelector('label[for="year-select"]').hidden = ys.hidden = filter !== "all";
  let rows = days, caption = "";
  if (filter === "week") {
    const start = C.weekStartMonday(today), end = C.addDays(start, 6);
    rows = days.filter((d) => d.date >= start && d.date <= end);
    caption = `${dayLabel(start, false)} – ${dayLabel(end, false)}`;
  } else if (filter === "month") {
    rows = days.filter((d) => C.groupKey(d.date, s.grouping) === selKey);
    caption = monthName(selKey || C.groupKey(today, s.grouping));
  } else {
    if (ys.value !== "all") rows = days.filter((d) => d.date.startsWith(ys.value));
    caption = `${rows.length} ${rows.length === 1 ? "day" : "days"}`;
  }
  $("#history-caption").textContent = caption;
  hist.items = rows.map((d) => ({ key: d.date, html: dayCard(d, s, today, holidaySet, holidays) }));
  $("#history").dataset.empty = rows.length ? "" : days.length ? "range" : "none";
});

repeat("#history", hist, "items", {
  key: (it) => it.key,
  element: "article",
  render(it, el) {
    el.className = "card day";
    el.innerHTML = it.html;
  },
});

// ---------------- day form ----------------
const form = state({
  title: "", date: "", status: "office", rStart: "", rEnd: "", rHours: "", rPto: "",
  verified: false, aStart: "", aEnd: "", aHours: "", aPto: "", note: "",
  error: "", saveLabel: "Save", statusHint: "", showTimes: true, showPto: true,
  hoursLocked: false, preview: "", canCopy: false, editOf: null,
});

const STATUS_HINT = {
  office: "Counts toward presence and average hours.",
  wfh: "Presence 0. Not counted in average hours.",
  ooo: "Out of office: presence 1. Add PTO hours if any.",
  sick: "Sick day: presence 1. Add PTO hours if any.",
};

effect(() => {
  const { status, rStart, rEnd, rHours, rPto } = form;
  const s = data.settings;
  $("#f-status").innerHTML = seg(C.STATUSES.map((x) => [x, C.STATUS_LABEL[x]]), status, "form-status");
  form.statusHint = STATUS_HINT[status];
  form.showTimes = status === "office";
  form.showPto = status !== "wfh";
  form.hoursLocked = !!(rStart && rEnd);
  const entry = { start: rStart || null, end: rEnd || null, hours: numOrNull(rHours), pto: numOrNull(rPto) };
  form.canCopy = status === "office" ? !!(rStart && rEnd) || entry.hours !== null || entry.pto !== null : entry.pto !== null;
  if (status === "office" && rStart && rEnd) {
    const p = C.predicted(entry, s);
    form.preview = p.hours === null ? "Clock out must differ from clock in." : `Predicted timesheet: ${C.fmtTime(p.start)} → ${C.fmtTime(p.end)} · ${C.fmtHours(p.hours)}`;
  } else if (status === "office" && rStart && !rEnd) {
    form.preview = "No clock-out yet: the day stays in progress.";
  } else {
    form.preview = "";
  }
});

function numOrNull(v) {
  const t = String(v ?? "").trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : NaN;
}

function openDayForm(date) {
  const d = date ? findDay(date) : null;
  const r = d?.recorded, a = d?.actual;
  Object.assign(form, {
    title: d ? `Edit ${dayLabel(d.date, false)}` : "Manual entry",
    date: d?.date ?? ui.today,
    status: d?.status ?? "office",
    rStart: r?.start ?? "", rEnd: r?.end ?? "", rHours: r?.hours ?? "", rPto: r?.pto ?? "",
    verified: !!a,
    aStart: a?.start ?? "", aEnd: a?.end ?? "", aHours: a?.hours ?? "", aPto: a?.pto ?? "",
    note: d?.note ?? "",
    error: "",
    saveLabel: d ? "Save changes" : "Save day",
    editOf: d?.date ?? null,
  });
  openDialog("#day-dialog");
}

function copyPredicted() {
  const p = predictedActual({ recorded: { start: form.rStart || null, end: form.rEnd || null, hours: numOrNull(form.rHours), pto: numOrNull(form.rPto) } });
  Object.assign(form, { aStart: p.start ?? "", aEnd: p.end ?? "", aHours: p.hours ?? "", aPto: p.pto ?? "" });
}

function saveDayForm() {
  const f = form;
  const fail = (msg) => { form.error = msg; return false; };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(f.date)) return fail("Pick a date.");
  const office = f.status === "office";
  const nums = {};
  for (const [k, label] of [["rHours", "Hours"], ["rPto", "PTO hours"], ["aHours", "Timesheet hours"], ["aPto", "Timesheet PTO hours"]]) {
    const n = numOrNull(f[k]);
    if (Number.isNaN(n) || (n !== null && (n < 0 || n > 24))) return fail(`${label} must be a number from 0 to 24.`);
    nums[k] = n;
  }
  let recorded = null;
  if (office) {
    if (f.rEnd && !f.rStart) return fail("Add a clock-in time, or clear clock-out.");
    if (f.rStart && f.rEnd && f.rStart === f.rEnd) return fail("Clock out must differ from clock in.");
    const hasTimes = !!(f.rStart || f.rEnd);
    if (hasTimes || nums.rHours !== null || nums.rPto !== null) {
      recorded = { start: f.rStart || null, end: f.rEnd || null, hours: hasTimes ? null : nums.rHours, pto: nums.rPto };
    }
  } else if (nums.rPto !== null) {
    recorded = { start: null, end: null, hours: null, pto: nums.rPto };
  }
  if (recorded && office && recorded.start && !recorded.end) {
    const other = data.days.find((d) => C.isOpen(d) && d.date !== f.date && d.date !== f.editOf);
    if (other) return fail(`You are still clocked in on ${dayLabel(other.date, false)}. Clock out there first.`);
  }
  let actual = null;
  if (f.verified) {
    if (office) {
      if (f.aEnd && !f.aStart) return fail("Timesheet: add the in time, or clear the out time.");
      const span = C.spanHours(f.aStart || null, f.aEnd || null);
      actual = { start: f.aStart || null, end: f.aEnd || null, hours: nums.aHours ?? (span === null ? null : round2(span)), pto: nums.aPto };
      if (actual.hours === null && actual.pto === null) return fail("Timesheet: enter in and out times, hours or PTO, or turn off Verified.");
    } else {
      actual = { start: null, end: null, hours: null, pto: f.status === "wfh" ? null : nums.aPto };
    }
  }
  if (f.date !== f.editOf && findDay(f.date) && !confirm(`${dayLabel(f.date)} already has an entry. Replace it?`)) return false;
  putDay({ date: f.date, status: f.status, recorded, actual, note: f.note.trim() }, f.editOf && f.editOf !== f.date ? f.editOf : null);
  toast(f.editOf ? "Day updated" : "Day saved");
  return true;
}

// ---------------- verify dialog ----------------
effect(() => {
  const list = m.toVerify, coverage = m.coverage, later = m.laterUnverified, s = data.settings;
  const body = $("#verify-body");
  if (!list.length) {
    body.innerHTML = `<p class="dim">Nothing to check. Days through ${esc(dayLabel(coverage, false))} are verified.${later ? ` ${later} newer ${later === 1 ? "day is" : "days are"} waiting for the next timesheet.` : ""}</p>`;
    return;
  }
  body.innerHTML = `
    <p class="hint">Timesheet through <b>${esc(dayLabel(coverage, false))}</b>. Tap <b>Matches</b> when it shows the predicted values, or <b>Edit</b> to type what it really says. Differences feed the rounding check in Settings.</p>
    <div class="vlist">${list.map((d) => {
      const r = C.resolve(d, s);
      const rec = d.recorded;
      const p = rec ? C.predicted(rec, s) : null;
      const what = d.status !== "office"
        ? `${C.STATUS_LABEL[d.status]}${r.pto !== null ? ` · PTO ${C.fmtHours(r.pto)}` : ""}`
        : p && C.isTime(rec.start) && C.isTime(rec.end)
          ? `${C.fmtTime(p.start)} → ${C.fmtTime(p.end)} · <b>${C.fmtHours(p.hours)}</b><br><span class="dim small">you: ${C.fmtTime(rec.start)} → ${C.fmtTime(rec.end)}</span>`
          : `${r.total === null ? "No hours" : C.fmtHours(r.total)}`;
      return `<div class="vrow"><div><b>${esc(dayLabel(d.date, false))}</b><p class="small">${what}</p></div>
        <div class="vbtns"><button type="button" class="pill sm" data-action="edit-day" data-date="${d.date}">Edit</button>
        <button type="button" class="pill sm primary" data-action="verify-one" data-date="${d.date}">Matches</button></div></div>`;
    }).join("")}</div>
    <button type="button" class="btn primary block-btn" data-action="verify-all">All ${list.length} match the timesheet</button>`;
});

// ---------------- settings dialog ----------------
const sview = state({ holidayText: "", holidayMsg: "", backupInfo: "", storageInfo: "", versionInfo: `RTO ${APP_VERSION}` });

function themePref() { try { return localStorage.getItem("rto-theme") || "system"; } catch { return "system"; } }
const theme = state({ pref: themePref() });
effect(() => {
  const pref = theme.pref;
  const root = document.documentElement;
  if (pref === "light" || pref === "dark") root.dataset.theme = pref; else delete root.dataset.theme;
  try { localStorage.setItem("rto-theme", pref); } catch { /* ignore */ }
  const dark = pref === "dark" || (pref === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
  $('meta[name="theme-color"]').setAttribute("content", dark ? "#171612" : "#f4f1ea");
  $("#s-theme").innerHTML = seg([["system", "System"], ["light", "Light"], ["dark", "Dark"]], pref, "theme");
});
matchMedia("(prefers-color-scheme: dark)").addEventListener?.("change", () => { const p = theme.pref; theme.pref = ""; theme.pref = p; });

const RULES = [["down", "Down"], ["up", "Up"], ["nearest", "Nearest"], ["custom", "Custom"], ["none", "None"]];
function ruleBlock(side, rule) {
  const label = side === "roundIn" ? "Clock-in" : "Clock-out";
  const ex = side === "roundIn" ? ["09:01", "09:05", "09:12"] : ["16:16", "16:19", "16:20"];
  const grace = C.graceOf(rule);
  return `<p class="label">${label}</p>
    <div class="seg full" role="group" aria-label="${label} rounding">${seg(RULES, rule.mode, side)}</div>
    ${rule.mode === "custom" ? `<div class="row gap grace-row"><label class="small dim" for="g-${side}">Grace</label>
      <select id="g-${side}" class="pill-select" data-grace="${side}">${Array.from({ length: 15 }, (_, i) => `<option value="${i}"${i === grace ? " selected" : ""}>${i} min</option>`).join("")}</select></div>` : ""}
    <p class="hint mono-nums">${ex.map((t) => `${C.fmtTime(t)} → ${C.fmtTime(C.roundTime(t, rule))}`).join(" · ")}</p>`;
}
effect(() => {
  const s = data.settings;
  $("#s-grouping").innerHTML = seg([["tracking", "Tracking month"], ["calendar", "Calendar month"]], s.grouping, "grouping");
  $("#s-round-in").innerHTML = ruleBlock("roundIn", s.roundIn);
  $("#s-round-out").innerHTML = ruleBlock("roundOut", s.roundOut);
});

effect(() => {
  const days = data.days, s = data.settings;
  const rc = C.roundingCheck(days, s);
  const el = $("#s-check");
  if (!rc.in.total) {
    el.innerHTML = `<p class="hint">Once you verify days that also have your own punches, this shows how often the rounding rules predicted the timesheet, and which grace fits.</p>`;
    return;
  }
  const presets = (f) => [["Down", 14], ["Nearest", 7], ["Up", 0]].filter(([, g]) => g >= f.lo && g <= f.hi).map(([n]) => n);
  const fit = (f, side) => !f ? "" : f.ok
    ? `<li>${side}: ${presets(f).length ? `<b>${presets(f).join(" or ")}</b> fits` : "fits"} all ${f.used} verified days (any grace of <b>${f.lo === f.hi ? `${f.lo} min` : `${f.lo}–${f.hi} min`}</b>)${f.odd ? `; ${f.odd} off the quarter-hour grid` : ""}.</li>`
    : `<li>${side}: no single grace fits; the verified days disagree. Check the entries below.</li>`;
  el.innerHTML = `
    <p class="small">Clock-in matched <b>${rc.in.match}/${rc.in.total}</b> · clock-out matched <b>${rc.out.match}/${rc.out.total}</b> with the current rules.</p>
    <ul class="hint fit">${fit(rc.fit.in, "Clock-in")}${fit(rc.fit.out, "Clock-out")}</ul>
    ${rc.mismatches.length ? `<details><summary class="small">${rc.mismatches.length} ${rc.mismatches.length === 1 ? "mismatch" : "mismatches"}</summary><ul class="mismatch">${rc.mismatches.slice(-30).reverse().map((x) =>
      `<li><b>${esc(dayLabel(x.date, false))}</b>: punched ${C.fmtTime(x.recorded.start)} → ${C.fmtTime(x.recorded.end)}, predicted ${C.fmtTime(x.predicted.start)} → ${C.fmtTime(x.predicted.end)}, timesheet ${C.fmtTime(x.actual.start)} → ${C.fmtTime(x.actual.end)}</li>`).join("")}</ul></details>` : ""}`;
});

effect(() => {
  const last = data.lastExportAt, n = data.days.length, h = data.holidays.length;
  sview.backupInfo = `${n} days and ${h} holidays on this device. ${last ? `Last export ${new Date(last).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}.` : "Never exported."} Import merges by date: a day in the file replaces the same day here.`;
  const where = data.storage === "localstorage" ? "localStorage (IndexedDB unavailable)" : data.storage === "failed" ? "nowhere: saving failed" : "IndexedDB";
  const persist = data.persist === "granted" ? "persistent (protected from automatic cleanup)" : data.persist === "denied" ? "best-effort (the browser may clear it under storage pressure)" : "best-effort";
  sview.storageInfo = `Stored in ${where}, ${persist}. Deleting the Home Screen app or clearing website data erases it.`;
});

function openSettings() {
  batch(() => {
    sview.holidayText = C.holidaysToText(data.holidays);
    sview.holidayMsg = "";
  });
  openDialog("#settings-dialog");
}

// ---------------- dialogs ----------------
function openDialog(sel) {
  const d = $(sel);
  if (!d.open) d.showModal();
  document.documentElement.classList.add("modal-open");
  d.scrollTop = 0;
}
function closeDialogs() {
  document.querySelectorAll("dialog[open]").forEach((d) => d.close());
}
document.querySelectorAll("dialog").forEach((d) => {
  d.addEventListener("close", () => {
    if (!document.querySelector("dialog[open]")) document.documentElement.classList.remove("modal-open");
  });
  d.addEventListener("click", (e) => { if (e.target === d) d.close(); });
});

// ---------------- export / import ----------------
async function doExport() {
  const json = exportJson();
  const name = `rto-backup-${ui.today}.json`;
  const file = new File([json], name, { type: "application/json" });
  // The share sheet is the reliable way to "Save to Files" from an iOS
  // Home Screen app; elsewhere fall back to a normal download.
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: name });
      markExported();
      toast("Backup exported");
    } catch (e) {
      if (e?.name !== "AbortError") toast("Could not share the file.");
    }
    return;
  }
  const url = URL.createObjectURL(file);
  const a = Object.assign(document.createElement("a"), { href: url, download: name });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  markExported();
  toast("Backup downloaded");
}

$("#import-file").addEventListener("change", async (e) => {
  const file = e.target.files?.[0];
  e.target.value = "";
  if (!file) return;
  try {
    const text = await file.text();
    const res = importJson(text);
    await flush();
    sview.holidayText = C.holidaysToText(data.holidays);
    toast(`Imported ${res.days} days${res.holidays ? ` and ${res.holidays} holidays` : ""}${res.skipped ? ` (${res.skipped} rows skipped)` : ""}`);
  } catch (err) {
    toast(err.message || "Import failed.");
  }
});

// ---------------- events ----------------
let deleteDate = null;
const actions = {
  "open-settings": openSettings,
  "open-manual": () => openDayForm(null),
  "open-verify": () => openDialog("#verify-dialog"),
  "close-dialog": closeDialogs,
  punch: async () => { await punch(); },
  "today-status": (el) => setTodayStatus(el.dataset.value),
  "edit-day": (el) => { closeDialogs(); openDayForm(el.dataset.date); },
  "verify-one": (el) => verifyAsPredicted([el.dataset.date]),
  "verify-all": () => { verifyAsPredicted(m.toVerify.map((d) => d.date)); closeDialogs(); },
  "ask-delete": (el) => {
    deleteDate = el.dataset.date;
    $("#delete-text").textContent = `${dayLabel(deleteDate)} will be removed from this device.`;
    openDialog("#delete-dialog");
  },
  "confirm-delete": () => { if (deleteDate) deleteDay(deleteDate); deleteDate = null; closeDialogs(); toast("Day deleted"); },
  "save-day": () => { if (saveDayForm()) closeDialogs(); },
  "copy-predicted": copyPredicted,
  "form-status": (el) => { form.status = el.dataset.value; },
  "chart-group": (el) => { ui.chartGroup = el.dataset.value; },
  "history-filter": (el) => { ui.filter = el.dataset.value; },
  "left-dec": () => updateSettings({ workdaysOverride: { key: m.selKey, value: Math.max(0, m.left - 1) } }),
  "left-inc": () => updateSettings({ workdaysOverride: { key: m.selKey, value: Math.min(31, m.left + 1) } }),
  "left-reset": () => updateSettings({ workdaysOverride: null }),
  theme: (el) => { theme.pref = el.dataset.value; },
  grouping: (el) => updateSettings({ grouping: el.dataset.value }),
  roundIn: (el) => updateSettings({ roundIn: { ...data.settings.roundIn, mode: el.dataset.value } }),
  roundOut: (el) => updateSettings({ roundOut: { ...data.settings.roundOut, mode: el.dataset.value } }),
  "save-holidays": () => {
    const { list, bad } = C.parseHolidays(sview.holidayText);
    setHolidays(list);
    sview.holidayText = C.holidaysToText(list);
    sview.holidayMsg = `Saved ${list.length}${bad ? `; ${bad} ${bad === 1 ? "line" : "lines"} not understood` : ""}.`;
  },
  export: doExport,
  import: () => $("#import-file").click(),
  wipe: async () => {
    if (!confirm("Erase every day, holiday and setting on this device? Export a backup first if you might need it.")) return;
    if (!confirm("This cannot be undone. Erase everything?")) return;
    await wipeAll();
    closeDialogs();
    toast("All data erased");
  },
};

document.addEventListener("click", (e) => {
  const el = e.target.closest("[data-action]");
  if (!el || el.disabled) return;
  const fn = actions[el.dataset.action];
  if (fn) { e.preventDefault(); fn(el); }
});

document.addEventListener("change", (e) => {
  const el = e.target;
  if (el.id === "month-select") { batch(() => { ui.monthSel = el.value; ui.yearSel = null; }); return; }
  if (el.id === "year-select") { ui.yearSel = el.value; return; }
  if (el.dataset.grace) { const side = el.dataset.grace; updateSettings({ [side]: { mode: "custom", grace: Number(el.value) } }); return; }
  // Some iOS pickers only fire "change"; mirror bound form fields here too.
  if (el.closest("#day-dialog") && el.dataset.bind && el.type !== "checkbox") form[el.dataset.bind] = el.value;
});

const commitTarget = () => {
  const v = Number(String(view.targetText).trim());
  if (Number.isFinite(v) && v > 0 && v <= 24) updateSettings({ target: v });
  else view.targetText = String(data.settings.target);
};
$("#day-form").addEventListener("submit", (e) => { e.preventDefault(); if (saveDayForm()) closeDialogs(); });
$("#target-input").addEventListener("change", commitTarget);
$("#target-input").addEventListener("keydown", (e) => { if (e.key === "Enter") e.target.blur(); });

// ---------------- boot ----------------
bindDom($("#app"), view, { handlers: [show, classToggle("out")] });
bindDom($("#day-dialog"), form, { handlers: [show] });
bindDom($("#settings-dialog"), sview, { handlers: [show] });
bindDom($("#toast-root"), ui, { handlers: [show] });

function tick() {
  const d = new Date();
  const key = C.dateKey(d);
  batch(() => {
    ui.nowMs = d.getTime();
    if (ui.today !== key) ui.today = key;
  });
}
setInterval(tick, 1000);
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") flush();
  else tick();
});
window.addEventListener("pagehide", () => { flush(); });

init().then(tick);

if ("serviceWorker" in navigator && location.protocol !== "file:") {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}

// Exposed for debugging in the console.
window.rto = { data, ui, m };
