import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { DEFAULT_SETTINGS } from "../../src/js/domain/constants.js";
import { isOpen, needsVerification, presenceOf, resolveDay } from "../../src/js/domain/days.js";
import { spanHours } from "../../src/js/domain/time.js";
import { office, plain } from "../helpers.js";

describe("spanHours", () => {
  test("overnight shifts wrap; equal times mean no duration", () => {
    assert.equal(spanHours("22:00", "06:00"), 8);
    assert.equal(spanHours("16:15", "16:15"), null);
    assert.equal(spanHours(null, "16:15"), null);
  });
});

describe("resolveDay", () => {
  test("unverified days use the predicted rounding", () => {
    const r = resolveDay(office("2026-11-16", "08:58", "16:20"), DEFAULT_SETTINGS);

    assert.equal(r.verified, false);
    assert.equal(r.work, 7.75);
  });

  test("verified days use the timesheet", () => {
    const day = { ...office("2026-11-16", "08:58", "16:20"), actual: { start: "08:45", end: "16:15", hours: null, pto: null } };
    const r = resolveDay(day, DEFAULT_SETTINGS);

    assert.equal(r.verified, true);
    assert.equal(r.work, 7.5);
  });

  test("an open punch has no work hours yet", () => {
    const day = office("2026-11-20", "09:00", null);

    assert.equal(isOpen(day), true);
    assert.equal(resolveDay(day, DEFAULT_SETTINGS).work, null);
  });
});

describe("presenceOf", () => {
  test("WFH 0, OOO and Sick 1, blank office 0", () => {
    /** @param {import("../../src/js/domain/types.js").Day} d */
    const p = (d) => presenceOf(d, resolveDay(d, DEFAULT_SETTINGS));

    assert.equal(p(plain("2026-11-03", "wfh")), 0);
    assert.equal(p(plain("2026-11-04", "ooo")), 1);
    assert.equal(p(plain("2026-11-05", "sick")), 1);
    assert.equal(p(plain("2026-11-06", "office")), 0);
    assert.equal(p(office("2026-11-02", "09:00", "17:00")), 1);
  });
});

test("needsVerification skips verified, open and blank office days", () => {
  assert.equal(needsVerification(office("2026-11-02", "09:00", "17:00")), true);
  assert.equal(needsVerification(plain("2026-11-03", "wfh")), true);
  assert.equal(needsVerification(plain("2026-11-06", "office")), false);
  assert.equal(needsVerification(office("2026-11-20", "09:00", null)), false);
});
