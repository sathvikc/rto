import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { DEFAULT_SETTINGS } from "../../src/js/domain/constants.js";
import { isStaleShift, leaveMinuteFor, leavePlan, nextRoundingStep, usualTimes } from "../../src/js/domain/shift.js";
import { toMinutes } from "../../src/js/domain/time.js";
import { office } from "../helpers.js";

// Defaults: clock-in rounds down; clock-out custom grace 4 (4:16-4:19 -> 4:15, 4:20 -> 4:30).
const settings = DEFAULT_SETTINGS;

describe("isStaleShift", () => {
  test("open shift from an earlier day is stale", () => {
    assert.equal(isStaleShift(office("2026-11-24", "08:57", null), "2026-11-25", toMinutes("08:00")), true);
  });

  test("today's shift is stale only after 14 hours", () => {
    const day = office("2026-11-25", "08:00", null);

    assert.equal(isStaleShift(day, "2026-11-25", toMinutes("21:59")), false);
    assert.equal(isStaleShift(day, "2026-11-25", toMinutes("22:00")), true);
  });

  test("closed shifts are never stale", () => {
    assert.equal(isStaleShift(office("2026-11-24", "08:57", "16:20"), "2026-11-25", 0), false);
    assert.equal(isStaleShift(null, "2026-11-25", 0), false);
  });
});

describe("nextRoundingStep", () => {
  test("next minute that credits a later quarter, grace 4", () => {
    assert.equal(nextRoundingStep(toMinutes("16:17"), settings), toMinutes("16:20"));
    assert.equal(nextRoundingStep(toMinutes("16:15"), settings), toMinutes("16:20"));
    assert.equal(nextRoundingStep(toMinutes("16:22"), settings), toMinutes("16:35"));
  });

  test("no rounding, no step", () => {
    assert.equal(nextRoundingStep(600, { ...settings, roundOut: { mode: "none" } }), null);
  });
});

describe("leavePlan", () => {
  test("now, next step and the goal exit", () => {
    const plan = leavePlan("08:57", toMinutes("16:17"), settings, 8);

    assert.deepEqual(plan?.now, { at: "16:17", out: "16:15", hours: 7.5 });
    assert.deepEqual(plan?.next, { at: "16:20", out: "16:30", hours: 7.75 });
    // In rounds to 8:45; 8h needs a 16:45 timesheet out, first reached at 16:35.
    assert.deepEqual(plan?.goal, { at: "16:35", out: "16:45", hours: 8 });
  });

  test("no goal once it is met", () => {
    assert.equal(leavePlan("08:00", toMinutes("17:00"), settings, 8)?.goal, null);
  });

  test("leaveMinuteFor finds the earliest exit, counting the round-up", () => {
    // 9:50 is 5 min past the quarter (> 4 min grace), so it rounds up to 10:00.
    assert.equal(leaveMinuteFor("09:00", 1, settings, toMinutes("09:00")), toMinutes("09:50"));
  });
});

describe("usualTimes", () => {
  test("median of recent office punches, rounded to 5 minutes", () => {
    const days = [
      office("2026-11-20", "08:57", "16:18"),
      office("2026-11-19", "08:52", "16:31"),
      office("2026-11-18", "09:06", "16:22"),
      { ...office("2026-11-17", "07:00", "20:00"), status: /** @type {const} */ ("wfh") },
    ];

    assert.deepEqual(usualTimes(days), { start: "08:55", end: "16:20" });
  });

  test("needs at least three days", () => {
    assert.equal(usualTimes([office("2026-11-20", "08:57", "16:18")]), null);
  });
});
