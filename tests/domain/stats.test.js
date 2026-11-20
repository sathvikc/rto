import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { DEFAULT_SETTINGS } from "../../src/js/domain/constants.js";
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
