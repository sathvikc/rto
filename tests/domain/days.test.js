import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { DEFAULT_SETTINGS } from "../../src/js/domain/constants.js";
import {
  canToggleMatch,
  isOpen,
  isVerified,
  needsVerification,
  presenceOf,
  resolveDay,
  unmatchDay,
  unverifyFuture,
} from "../../src/js/domain/days.js";
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

test("needsVerification: only logged office days that are not matched or open", () => {
  assert.equal(needsVerification(office("2026-11-02", "09:00", "17:00")), true);
  assert.equal(needsVerification(plain("2026-11-03", "wfh")), false);
  assert.equal(needsVerification(plain("2026-11-06", "office")), false);
  assert.equal(needsVerification(office("2026-11-20", "09:00", null)), false);
});

describe("verification", () => {
  test("WFH, OOO and Sick count as verified automatically", () => {
    for (const status of /** @type {const} */ (["wfh", "ooo", "sick"])) assert.equal(isVerified(plain("2026-11-03", status)), true);

    assert.equal(isVerified(office("2026-11-02", "09:00", "17:00")), false);
  });

  test("only finished office days can toggle Matches", () => {
    assert.equal(canToggleMatch(office("2026-11-02", "09:00", "17:00")), true);
    assert.equal(canToggleMatch(office("2026-11-02", "09:00", null)), false);
    assert.equal(canToggleMatch(plain("2026-11-03", "ooo")), false);
  });

  test("unmatching keeps your entry, or the timesheet numbers when there is no entry", () => {
    const sheet = { start: "08:45", end: "16:15", hours: 7.5, pto: null };
    const punched = { ...office("2026-11-02", "08:58", "16:20"), actual: sheet };
    const importedOnly = { ...plain("2026-02-02", "office"), actual: sheet };

    assert.deepEqual(unmatchDay(punched).recorded, punched.recorded);
    assert.equal(unmatchDay(punched).actual, null);
    assert.deepEqual(unmatchDay(importedOnly).recorded, sheet);
  });

  test("a future day cannot stay verified", () => {
    const planned = { ...plain("2026-11-24", "ooo"), actual: { start: null, end: null, hours: null, pto: 5 } };

    assert.deepEqual(unverifyFuture(planned, "2026-11-20").recorded?.pto, 5);
    assert.equal(unverifyFuture(planned, "2026-11-20").actual, null);
    assert.equal(unverifyFuture(planned, "2026-11-24"), planned);
  });
});
