import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { copyHolidays, holidayDateOf, holidayDay, holidaysAsDays, holidaysIn, placeHoliday } from "../../src/js/domain/holidays.js";
import { office, plain } from "../helpers.js";

describe("placeHoliday", () => {
  test("a weekday holiday stays on its date", () => {
    assert.deepEqual(placeHoliday([], "2026-11-26", "Thanksgiving").day, holidayDay("2026-11-26", "Thanksgiving"));
  });

  test("Saturday is observed on the Friday before, Sunday on the Monday after", () => {
    const sat = placeHoliday([], "2026-07-04", "Independence Day").day;
    const sun = placeHoliday([], "2027-07-04", "Independence Day").day;

    assert.deepEqual([sat?.date, sat?.observedFrom], ["2026-07-03", "2026-07-04"]);
    assert.deepEqual([sun?.date, sun?.observedFrom], ["2027-07-05", "2027-07-04"]);
  });

  test("steps past another holiday in the same direction", () => {
    // Christmas 2027 is a Saturday and Dec 24 is already a holiday: Thursday.
    const placed = placeHoliday([holidayDay("2027-12-24", "Christmas Eve")], "2027-12-25", "Christmas Day").day;

    assert.equal(placed?.date, "2027-12-23");
  });

  test("never overwrites a logged day; blank days are fine", () => {
    assert.match(
      placeHoliday([office("2026-07-03", "09:00", "17:00")], "2026-07-04", "Independence Day").error ?? "",
      /weekday 2026-07-03/,
    );

    assert.equal(placeHoliday([plain("2026-07-03", "office")], "2026-07-04", "Independence Day").day?.date, "2026-07-03");
  });

  test("moving a holiday ignores its own record", () => {
    const days = [holidayDay("2026-07-03", "Independence Day", "2026-07-04")];

    assert.equal(placeHoliday(days, "2026-07-05", "Independence Day", "2026-07-03").day?.date, "2026-07-06");
  });
});

describe("holiday lists", () => {
  test("holidaysAsDays converts an old list, keeping logged days", () => {
    const { days, added } = holidaysAsDays(
      [plain("2026-01-01", "office"), plain("2026-01-19", "wfh")],
      [
        { date: "2026-01-01", name: "New Year's Day" },
        { date: "2026-01-19", name: "MLK Day" },
        { date: "2026-07-04", name: "Independence Day" },
      ],
    );

    assert.equal(added, 2);
    assert.equal(days.find((d) => d.date === "2026-01-19")?.status, "wfh");
    assert.equal(days.find((d) => d.date === "2026-07-03")?.observedFrom, "2026-07-04");
  });

  test("holidaysIn groups by the real date, not the observed one", () => {
    // Jan 1 2028 is a Saturday: observed Fri Dec 31 2027, but it's a 2028 holiday.
    const newYear = placeHoliday([], "2028-01-01", "New Year's Day").day;

    assert.ok(newYear);
    assert.equal(newYear.date, "2027-12-31");
    assert.deepEqual(holidaysIn([newYear], "2028").map(holidayDateOf), ["2028-01-01"]);
    assert.deepEqual(holidaysIn([newYear], "2027"), []);
  });

  test("copyHolidays keeps real dates and observes them on the new year's weekday", () => {
    const days = [
      holidayDay("2026-07-03", "Independence Day", "2026-07-04"),
      holidayDay("2026-11-26", "Thanksgiving"),
      holidayDay("2024-02-29", "Leap"),
    ];

    const added = copyHolidays(days, "2026", "2027");

    assert.deepEqual(
      added.map((d) => [d.date, d.observedFrom ?? null, d.note]),
      [
        ["2027-07-05", "2027-07-04", "Independence Day"],
        ["2027-11-26", null, "Thanksgiving"],
      ],
    );

    assert.deepEqual(copyHolidays([...days, ...added], "2026", "2027"), []);
  });
});
