import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { DEFAULT_SETTINGS } from "../../src/js/domain/constants.js";
import { buildBackup, holidaysToText, mergeDays, parseHolidays, parseImport, replaceHolidaysForYear } from "../../src/js/domain/backup.js";
import { office } from "../helpers.js";

describe("parseImport", () => {
  test("round-trips this app's backup", () => {
    const days = [office("2026-11-16", "08:58", "16:20")];

    const backup = buildBackup({
      days,
      holidays: [{ date: "2026-11-26", name: "Thanksgiving" }],
      settings: DEFAULT_SETTINGS,
      createdAt: null,
    });

    const parsed = parseImport(JSON.parse(JSON.stringify(backup)));

    assert.deepEqual(parsed.days, days);
    assert.equal(parsed.holidays.length, 1);
    assert.deepEqual(parsed.settings.roundOut, DEFAULT_SETTINGS.roundOut);
  });

  test("flat rows: timesheet rows verified, punches unverified with raw times", () => {
    const parsed = parseImport({
      days: [
        { date: "2026-02-02", start_time: "08:45", end_time: "17:00", hours: 8.3, pto_hours: null, hours_with_pto: 8.3, source: "new" },
        { date: "2025-10-01", start_time: null, end_time: null, hours: null, pto_hours: 4, hours_with_pto: 8, source: "old" },
        { date: "2026-03-02", start_time: null, end_time: null, hours: null, pto_hours: 8, hours_with_pto: null, source: "new" },
        { date: "2026-11-16", start_time: "08:58", end_time: "16:20", hours: 7.37, pto_hours: null, hours_with_pto: 7.37, source: "app" },
        { date: "2026-02-30" },
        "junk",
      ],
    });

    const [sheet, oldView, ptoOnly, punch] = parsed.days;

    assert.equal(parsed.skipped, 2);
    assert.ok(sheet.actual && !sheet.recorded);
    assert.deepEqual(oldView.actual, { start: null, end: null, hours: 4, pto: 4 });
    assert.equal(ptoOnly.status, "ooo");
    assert.equal(punch.actual, null);
    assert.equal(punch.recorded?.hours, null);
  });

  test("rejects documents without days and ignores invalid settings", () => {
    assert.throws(() => parseImport({ nope: true }), /No days/);
    const parsed = parseImport({ days: [], settings: { grouping: "weekly", target: 99, roundIn: { mode: "sideways" } } });

    assert.deepEqual(parsed.settings, {});
  });
});

test("holiday text round-trips, sorted and de-duplicated", () => {
  const { list, invalid } = parseHolidays(
    "2026-11-27 Day after\n2026-11-26 Thanksgiving\n\nnope\n2026-02-30 Bad\n2026-11-26 Thanksgiving Day",
  );

  assert.deepEqual(
    list.map((h) => h.date),
    ["2026-11-26", "2026-11-27"],
  );

  assert.equal(list[0].name, "Thanksgiving Day");
  assert.equal(invalid, 2);
  assert.equal(holidaysToText(list), "2026-11-26 Thanksgiving Day\n2026-11-27 Day after");
});

test("saving one year's holidays keeps the other years", () => {
  const existing = [
    { date: "2026-11-26", name: "Thanksgiving" },
    { date: "2026-12-25", name: "Christmas Day" },
    { date: "2027-01-01", name: "Old" },
  ];

  const next = replaceHolidaysForYear(existing, "2027", [
    { date: "2027-01-01", name: "New Year's Day" },
    { date: "2027-11-25", name: "Thanksgiving" },
    { date: "2026-12-24", name: "Christmas Eve" },
  ]);

  assert.deepEqual(
    next.map((h) => `${h.date} ${h.name}`),
    [
      "2026-11-26 Thanksgiving",
      "2026-12-24 Christmas Eve",
      "2026-12-25 Christmas Day",
      "2027-01-01 New Year's Day",
      "2027-11-25 Thanksgiving",
    ],
  );
});

test("import merge: the file wins on the same date, other local days are kept", () => {
  const local = [office("2026-11-02", "09:00", "17:00"), office("2026-11-03", "09:00", "17:00")];
  const incoming = [office("2026-11-03", "08:30", "16:30"), office("2026-11-04", "09:00", "17:00")];
  const { days, added, replaced } = mergeDays(local, incoming);

  assert.deepEqual(
    days.map((d) => `${d.date} ${d.recorded?.start}`),
    ["2026-11-04 09:00", "2026-11-03 08:30", "2026-11-02 09:00"],
  );

  assert.deepEqual([added, replaced], [1, 1]);
});
