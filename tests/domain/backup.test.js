import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { DEFAULT_SETTINGS } from "../../src/js/domain/constants.js";
import { backupFileName, buildBackup, mergeDays, parseImport } from "../../src/js/domain/backup.js";
import { holidayDay } from "../../src/js/domain/holidays.js";
import { office, plain } from "../helpers.js";

describe("parseImport", () => {
  test("round-trips this app's backup", () => {
    const days = [office("2026-11-16", "08:58", "16:20"), holidayDay("2026-11-26", "Thanksgiving")];
    const backup = buildBackup({ days, settings: DEFAULT_SETTINGS, createdAt: null });
    const parsed = parseImport(JSON.parse(JSON.stringify(backup)));

    assert.deepEqual(parsed.days, days);
    assert.deepEqual(parsed.settings.roundOut, DEFAULT_SETTINGS.roundOut);
  });

  test("an older backup's holiday list becomes Holiday days; logged days are kept", () => {
    const parsed = parseImport({
      days: [
        office("2026-11-26", "09:00", "12:00"), // worked on the holiday: keep
        plain("2026-02-16", "office"), // blank row: becomes the holiday
      ],
      holidays: [
        { date: "2026-11-26", name: "Thanksgiving" },
        { date: "2026-02-16", name: "Presidents Day" },
        { date: "2026-12-25", name: "Christmas Day" },
        { date: "nope" },
      ],
    });

    assert.equal(parsed.holidays, 2);
    assert.equal(parsed.days.find((d) => d.date === "2026-11-26")?.status, "office");

    assert.deepEqual(
      parsed.days.find((d) => d.date === "2026-02-16"),
      holidayDay("2026-02-16", "Presidents Day"),
    );

    assert.equal(parsed.days.find((d) => d.date === "2026-12-25")?.note, "Christmas Day");
  });

  test("observedFrom survives a backup round-trip", () => {
    const days = [holidayDay("2026-07-03", "Independence Day", "2026-07-04")];
    const parsed = parseImport(JSON.parse(JSON.stringify(buildBackup({ days, settings: DEFAULT_SETTINGS, createdAt: null }))));

    assert.equal(parsed.days[0].observedFrom, "2026-07-04");
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

test("backup file name has the local date and time", () => {
  assert.equal(backupFileName(new Date(2026, 10, 20, 15, 32)), "rto-backup-2026-11-20-1532.json");
  assert.equal(backupFileName(new Date(2026, 0, 5, 9, 4)), "rto-backup-2026-01-05-0904.json");
});
