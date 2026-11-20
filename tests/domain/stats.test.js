import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { DEFAULT_SETTINGS } from "../../src/js/domain/constants.js";
import { isVerified } from "../../src/js/domain/days.js";
import {
  combineStats,
  freezeClosedMonths,
  monthlyStats,
  neededAverage,
  workdaysLeft,
  workdaysLeftDates,
} from "../../src/js/domain/stats.js";
import { groupEnd } from "../../src/js/domain/dates.js";
import { office, plain } from "../helpers.js";

const settings = DEFAULT_SETTINGS;

describe("monthlyStats", () => {
  test("presence counts weekdays in logged weeks; WFH 0, OOO/Sick 1", () => {
    const days = [
      office("2026-11-02", "09:00", "17:00"),
      plain("2026-11-03", "wfh"),
      plain("2026-11-04", "ooo"),
      plain("2026-11-05", "sick"),
      plain("2026-11-06", "office"),
    ];

    const [st] = monthlyStats(days, [], settings, "2026-11-06");

    assert.deepEqual([st.denom, st.present, st.presencePct, st.counted, st.wfh], [5, 3, 60, 1, 1]);
  });

  test("company holidays drop out of the denominator", () => {
    const days = ["2026-11-23", "2026-11-24", "2026-11-25"].map((d) => office(d, "09:00", "17:00"));

    const holidays = [
      { date: "2026-11-26", name: "Thanksgiving" },
      { date: "2026-11-27", name: "" },
    ];

    const [st] = monthlyStats(days, holidays, settings, "2026-11-27");

    assert.equal(st.denom, 3);
    assert.equal(st.presencePct, 100);
  });

  test("tracking month puts a straddling week in the earlier month", () => {
    const days = [office("2026-12-01", "09:00", "17:00")];

    assert.equal(monthlyStats(days, [], settings, "2026-12-01")[0].key, "2026-11");
    assert.equal(monthlyStats(days, [], { ...settings, grouping: "calendar" }, "2026-12-01")[0].key, "2026-12");
  });

  test("only office days count as unverified; WFH/OOO/Sick are verified automatically", () => {
    const days = [office("2026-11-02", "09:00", "17:00"), plain("2026-11-03", "wfh"), plain("2026-11-04", "ooo")];
    const [st] = monthlyStats(days, [], settings, "2026-11-06");

    assert.deepEqual([st.unverified, st.unverifiedAvg], [1, 1]);
  });
});

describe("workdaysLeft", () => {
  const days = [office("2026-11-25", "09:00", "17:00"), plain("2026-12-02", "ooo")];

  const holidays = [
    { date: "2026-11-26", name: "" },
    { date: "2026-11-27", name: "" },
  ];

  test("skips holidays, planned leave and a finished today; runs into December for the tracking month", () => {
    // Nov 30, Dec 1, Dec 3, Dec 4
    assert.equal(workdaysLeft("2026-11", days, holidays, settings, "2026-11-25"), 4);
  });

  test("lists the dates, including the next month's days of a straddling week", () => {
    const dates = workdaysLeftDates("2026-11", [], holidays, settings, "2026-11-20");

    assert.deepEqual(dates, [
      "2026-11-20",
      "2026-11-23",
      "2026-11-24",
      "2026-11-25",
      "2026-11-30",
      "2026-12-01",
      "2026-12-02",
      "2026-12-03",
      "2026-12-04",
    ]);
  });

  test("calendar month stops at the month end; past months have none", () => {
    assert.equal(workdaysLeft("2026-11", days, holidays, { ...settings, grouping: "calendar" }, "2026-11-25"), 1);
    assert.equal(workdaysLeft("2026-10", days, holidays, settings, "2026-11-25"), 0);
  });
});

test("neededAverage", () => {
  assert.equal(neededAverage({ total: 72, counted: 10 }, 5, 8), 9.6);
  assert.equal(neededAverage({ total: 72, counted: 10 }, 0, 8), null);
  assert.equal(neededAverage({ total: 200, counted: 10 }, 5, 8), 0);
});

test("combineStats sums months", () => {
  const [a] = monthlyStats([office("2026-11-02", "09:00", "17:00")], [], settings, "2026-11-06");
  const c = combineStats([a, a]);

  assert.deepEqual([c.counted, c.avg], [2, 8]);
});

test("dashboard view: verified days up to the timesheet coverage, presence counted to that date", () => {
  const sheet = { start: "09:00", end: "17:00", hours: 8, pto: null };

  const days = [
    { ...office("2026-11-16", "09:00", "17:00"), actual: sheet },
    { ...office("2026-11-17", "09:00", "17:00"), actual: sheet },
    office("2026-11-18", "09:00", "17:00"), // unverified, within coverage
    office("2026-11-23", "09:00", "17:00"), // after coverage
  ];

  const coverage = "2026-11-20";

  const [st] = monthlyStats(
    days.filter((d) => d.date <= coverage && isVerified(d)),
    [],
    settings,
    coverage,
  );

  // Week of Nov 15 only: Mon-Fri = 5 weekdays, 2 verified present.
  assert.deepEqual([st.counted, st.present, st.denom, st.presencePct], [2, 2, 5, 40]);
});

describe("freezeClosedMonths", () => {
  const days = [office("2026-10-05", "09:00", "17:00"), office("2026-11-02", "09:00", "17:00")];
  const holidays = [{ date: "2026-10-06", name: "" }];
  const coverage = "2026-11-13"; // October (tracking month ends Sat Oct 31) is closed; November is not.

  test("a closed month keeps its snapshot when holidays or settings change", () => {
    const first = freezeClosedMonths(monthlyStats(days, [], settings, "2026-11-13"), days, settings, coverage, {});
    const oct = first.stats.find((s) => s.key === "2026-10");

    assert.ok(first.snapshots["tracking:2026-10"]);
    assert.equal(first.snapshots["tracking:2026-11"], undefined);

    // Add a holiday in October: the live number changes, the frozen one doesn't.
    const live = monthlyStats(days, holidays, settings, "2026-11-13");

    assert.notEqual(live.find((s) => s.key === "2026-10")?.presencePct, oct?.presencePct);

    const again = freezeClosedMonths(live, days, settings, coverage, first.snapshots);

    assert.deepEqual(
      again.stats.find((s) => s.key === "2026-10"),
      oct,
    );
  });

  test("editing a day in a closed month recalculates it", () => {
    const first = freezeClosedMonths(monthlyStats(days, [], settings, "2026-11-13"), days, settings, coverage, {});
    const edited = [office("2026-10-05", "09:00", "18:00"), days[1]];
    const again = freezeClosedMonths(monthlyStats(edited, [], settings, "2026-11-13"), edited, settings, coverage, first.snapshots);

    assert.equal(again.stats.find((s) => s.key === "2026-10")?.avg, 9);
  });

  test("groupEnd: tracking month ends on the Saturday of its last week", () => {
    assert.equal(groupEnd("2026-11", "tracking"), "2026-12-05");
    assert.equal(groupEnd("2026-10", "tracking"), "2026-10-31");
    assert.equal(groupEnd("2026-11", "calendar"), "2026-11-30");
  });
});
