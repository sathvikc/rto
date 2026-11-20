// Run: node --test tests/
import { test } from "node:test";
import assert from "node:assert/strict";
import * as C from "../js/calc.js";

const S = { grouping: "tracking", roundIn: { mode: "down" }, roundOut: { mode: "custom", grace: 4 }, target: 8, releaseDay: 3 };
const office = (date, start, end, extra = {}) => ({ date, status: "office", recorded: { start, end, hours: null, pto: null }, actual: null, note: null, ...extra });

test("custom grace rounding: 4:16-4:19 -> 4:15, 4:20+ -> 4:30", () => {
  const r = { mode: "custom", grace: 4 };
  assert.equal(C.roundTime("16:15", r), "16:15");
  assert.equal(C.roundTime("16:16", r), "16:15");
  assert.equal(C.roundTime("16:19", r), "16:15");
  assert.equal(C.roundTime("16:20", r), "16:30");
  assert.equal(C.roundTime("16:29", r), "16:30");
});

test("named modes are grace presets", () => {
  assert.equal(C.roundTime("08:58", { mode: "down" }), "08:45");
  assert.equal(C.roundTime("08:46", { mode: "up" }), "09:00");
  assert.equal(C.roundTime("08:52", { mode: "nearest" }), "08:45");
  assert.equal(C.roundTime("08:53", { mode: "nearest" }), "09:00");
  assert.equal(C.roundTime("08:53", { mode: "none" }), "08:53");
  assert.equal(C.roundTime("23:59", { mode: "up" }), "00:00");
});

test("spans: overnight wraps, equal times are no duration", () => {
  assert.equal(C.spanHours("22:00", "06:00"), 8);
  assert.equal(C.spanHours("16:15", "16:15"), null);
});

test("verified days use the timesheet, unverified use predicted rounding", () => {
  const d = office("2026-11-16", "08:58", "16:20");
  const r = C.resolve(d, S);
  assert.equal(r.verified, false);
  assert.equal(r.work, 7.75);
  const v = C.resolve({ ...d, actual: { start: "08:45", end: "16:15", hours: null, pto: null } }, S);
  assert.equal(v.verified, true);
  assert.equal(v.work, 7.5);
});

test("presence: WFH 0, OOO and Sick 1, blank office 0", () => {
  const days = [
    office("2026-11-02", "09:00", "17:00"),
    { date: "2026-11-03", status: "wfh", recorded: null, actual: null },
    { date: "2026-11-04", status: "ooo", recorded: null, actual: null },
    { date: "2026-11-05", status: "sick", recorded: null, actual: null },
    { date: "2026-11-06", status: "office", recorded: null, actual: null },
  ];
  const [st] = C.monthlyStats(days, [], S, "2026-11-06");
  assert.equal(st.denom, 5);
  assert.equal(st.present, 3);
  assert.equal(st.presencePct, 60);
  assert.equal(st.counted, 1);
  assert.equal(st.wfh, 1);
});

test("holidays drop out of the presence denominator", () => {
  const days = [office("2026-11-23", "09:00", "17:00"), office("2026-11-24", "09:00", "17:00"), office("2026-11-25", "09:00", "17:00")];
  const hol = [{ date: "2026-11-26", name: "Thanksgiving" }, { date: "2026-11-27", name: "" }];
  const [st] = C.monthlyStats(days, hol, S, "2026-11-27");
  assert.equal(st.denom, 3);
  assert.equal(st.presencePct, 100);
});

test("workdays left skips holidays, planned leave and a finished today; follows the tracking month into December", () => {
  const days = [office("2026-11-25", "09:00", "17:00"), { date: "2026-12-02", status: "ooo", recorded: null, actual: null }];
  const hol = [{ date: "2026-11-26" }, { date: "2026-11-27" }];
  // Nov 30, Dec 1, Dec 3, Dec 4 (Dec 2 OOO; tracking month Nov runs through the week of Sun Nov 29)
  assert.equal(C.workdaysLeft("2026-11", days, hol, S, "2026-11-25"), 4);
  assert.equal(C.workdaysLeft("2026-11", days, hol, { ...S, grouping: "calendar" }, "2026-11-25"), 1);
  assert.equal(C.workdaysLeft("2026-10", days, hol, S, "2026-11-25"), 0);
});

test("needed average", () => {
  assert.equal(C.neededAverage({ total: 72, counted: 10 }, 5, 8), 9.6);
  assert.equal(C.neededAverage({ total: 72, counted: 10 }, 0, 8), null);
});

test("timesheet coverage: published Wednesday, covers through the previous Friday", () => {
  assert.equal(C.timesheetCoverage("2026-11-18"), "2026-11-13"); // Wed
  assert.equal(C.timesheetCoverage("2026-11-20"), "2026-11-13"); // Fri
  assert.equal(C.timesheetCoverage("2026-11-17"), "2026-11-06"); // Tue, before release
  assert.equal(C.timesheetCoverage("2026-11-25"), "2026-11-20");
});

test("rounding check finds the grace that fits verified clock-outs", () => {
  const days = [
    office("2026-11-02", "09:00", "16:17", { actual: { start: "09:00", end: "16:15", hours: null, pto: null } }),
    office("2026-11-03", "09:00", "16:23", { actual: { start: "09:00", end: "16:30", hours: null, pto: null } }),
    office("2026-11-04", "09:00", "16:19", { actual: { start: "09:00", end: "16:30", hours: null, pto: null } }),
  ];
  const rc = C.roundingCheck(days, S);
  assert.equal(rc.out.total, 3);
  assert.equal(rc.out.match, 2); // 16:19 predicted 16:15 but the timesheet says 16:30
  assert.deepEqual([rc.fit.out.lo, rc.fit.out.hi, rc.fit.out.ok], [2, 3, true]);
});

test("legacy import: timesheet rows become verified, punches stay unverified", () => {
  const imp = C.normalizeImport({ days: [
    { date: "2026-02-02", start_time: "08:45", end_time: "17:00", hours: 8.3, pto_hours: null, hours_with_pto: 8.3, source: "new" },
    { date: "2025-10-01", start_time: null, end_time: null, hours: null, pto_hours: 4, hours_with_pto: 8, source: "old" },
    { date: "2026-03-02", start_time: null, end_time: null, hours: null, pto_hours: 8, hours_with_pto: null, source: "new" },
    { date: "2026-11-16", start_time: "08:58", end_time: "16:20", hours: 7.37, pto_hours: null, hours_with_pto: 7.37, source: "app" },
    { date: "bad" },
  ] });
  assert.equal(imp.errors, 1);
  const [a, b, c, d] = imp.days;
  assert.ok(a.actual && !a.recorded);
  assert.deepEqual(b.actual, { start: null, end: null, hours: 4, pto: 4 });
  assert.equal(c.status, "ooo");
  assert.ok(d.recorded && !d.actual);
  assert.equal(d.recorded.hours, null);
});

test("holiday parsing", () => {
  const { list, bad } = C.parseHolidays("2026-11-27 Day after\n2026-11-26 Thanksgiving\n\nnope\n2026-02-30 Bad");
  assert.deepEqual(list.map((h) => h.date), ["2026-11-26", "2026-11-27"]);
  assert.equal(bad, 2);
});
