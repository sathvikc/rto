import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { DEFAULT_SETTINGS } from "../../src/js/domain/constants.js";
import { fitGrace, roundingCheck, timesheetCoverage } from "../../src/js/domain/verification.js";
import { office } from "../helpers.js";

describe("timesheetCoverage", () => {
  test("published Wednesday, covering through the previous Friday", () => {
    assert.equal(timesheetCoverage("2026-11-18", 3), "2026-11-13"); // Wed
    assert.equal(timesheetCoverage("2026-11-20", 3), "2026-11-13"); // Fri
    assert.equal(timesheetCoverage("2026-11-17", 3), "2026-11-06"); // Tue, before release
    assert.equal(timesheetCoverage("2026-11-25", 3), "2026-11-20");
  });
});

describe("fitGrace", () => {
  test("narrows to the range every pair agrees with", () => {
    assert.deepEqual(
      fitGrace([
        ["16:17", "16:15"],
        ["16:23", "16:30"],
        ["16:19", "16:30"],
      ]),
      { lo: 2, hi: 3, ok: true, used: 3, odd: 0 },
    );
  });

  test("reports contradictions and off-grid values", () => {
    const fit = fitGrace([
      ["16:18", "16:30"],
      ["16:16", "16:15"],
      ["16:20", "16:15"],
      ["16:22", "16:20"],
    ]);

    assert.equal(fit?.ok, false);
    assert.equal(fit?.odd, 1);
  });

  test("no usable pairs", () => {
    assert.equal(fitGrace([["16:15", "16:15"]]), null);
  });
});

test("roundingCheck compares predictions with verified days", () => {
  /** @param {string} date @param {string} raw @param {string} sheet */
  const day = (date, raw, sheet) => ({ ...office(date, "09:00", raw), actual: { start: "09:00", end: sheet, hours: null, pto: null } });
  const report = roundingCheck([day("2026-11-02", "16:17", "16:15"), day("2026-11-03", "16:19", "16:30")], DEFAULT_SETTINGS);

  assert.deepEqual([report.out.match, report.out.total, report.mismatches.length], [1, 2, 1]);
});
