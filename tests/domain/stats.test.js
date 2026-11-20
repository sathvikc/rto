import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { DEFAULT_SETTINGS } from "../../src/js/domain/constants.js";
import { isVerified } from "../../src/js/domain/days.js";
import { combineStats, monthlyStats, neededAverage, workdaysLeft, workdaysLeftDates } from "../../src/js/domain/stats.js";
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

    const [st] = monthlyStats(days, settings, "2026-11-06");

    assert.deepEqual([st.denom, st.present, st.presencePct, st.counted, st.wfh], [5, 3, 60, 1, 1]);
  });

  test("Holiday days drop out of presence and the average", () => {
    const days = [
      ...["2026-11-23", "2026-11-24", "2026-11-25"].map((d) => office(d, "09:00", "17:00")),
      plain("2026-11-26", "holiday"),
      plain("2026-11-27", "holiday"),
    ];

    const [st] = monthlyStats(days, settings, "2026-11-27");

    assert.deepEqual([st.denom, st.presencePct, st.counted], [3, 100, 3]);
  });

  test("past months read only day records, so settings can't rewrite them", () => {
    const days = [office("2026-10-05", "09:00", "17:00"), plain("2026-10-06", "holiday")];
    const before = monthlyStats(days, settings, "2026-11-20");
    const after = monthlyStats(days, { ...settings, target: 9, roundOut: { mode: "up" } }, "2026-11-20");

    assert.deepEqual(after, before);
  });

  test("tracking month puts a straddling week in the earlier month", () => {
    const days = [office("2026-12-01", "09:00", "17:00")];

    assert.equal(monthlyStats(days, settings, "2026-12-01")[0].key, "2026-11");
    assert.equal(monthlyStats(days, { ...settings, grouping: "calendar" }, "2026-12-01")[0].key, "2026-12");
  });

  test("only office days count as unverified; WFH/OOO/Sick/Holiday are verified automatically", () => {
    const days = [
      office("2026-11-02", "09:00", "17:00"),
      plain("2026-11-03", "wfh"),
      plain("2026-11-04", "ooo"),
      plain("2026-11-05", "holiday"),
    ];

    const [st] = monthlyStats(days, settings, "2026-11-06");

    assert.deepEqual([st.unverified, st.unverifiedAvg], [1, 1]);
  });
});

describe("workdaysLeft", () => {
  const days = [
    office("2026-11-25", "09:00", "17:00"),
    plain("2026-11-26", "holiday"),
    plain("2026-11-27", "holiday"),
    plain("2026-12-02", "ooo"),
  ];

  test("skips Holiday days, planned leave and a finished today; runs into December for the tracking month", () => {
    // Nov 30, Dec 1, Dec 3, Dec 4
    assert.equal(workdaysLeft("2026-11", days, settings, "2026-11-25"), 4);
  });

  test("lists the dates, including the next month's days of a straddling week", () => {
    const holidaysOnly = days.filter((d) => d.status === "holiday");

    assert.deepEqual(workdaysLeftDates("2026-11", holidaysOnly, settings, "2026-11-20"), [
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
    assert.equal(workdaysLeft("2026-11", days, { ...settings, grouping: "calendar" }, "2026-11-25"), 1);
    assert.equal(workdaysLeft("2026-10", days, settings, "2026-11-25"), 0);
  });
});

test("neededAverage", () => {
  assert.equal(neededAverage({ total: 72, counted: 10 }, 5, 8), 9.6);
  assert.equal(neededAverage({ total: 72, counted: 10 }, 0, 8), null);
  assert.equal(neededAverage({ total: 200, counted: 10 }, 5, 8), 0);
});

test("combineStats sums months", () => {
  const [a] = monthlyStats([office("2026-11-02", "09:00", "17:00")], settings, "2026-11-06");
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
    settings,
    coverage,
  );

  // Week of Nov 15 only: Mon-Fri = 5 weekdays, 2 verified present.
  assert.deepEqual([st.counted, st.present, st.denom, st.presencePct], [2, 2, 5, 40]);
});
