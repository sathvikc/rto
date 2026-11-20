import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { describeRule, graceOf, roundTime } from "../../src/js/domain/rounding.js";

describe("roundTime", () => {
  test("custom grace 4: 4:16-4:19 round down, 4:20+ round up", () => {
    const rule = /** @type {const} */ ({ mode: "custom", grace: 4 });
    assert.equal(roundTime("16:15", rule), "16:15");
    assert.equal(roundTime("16:16", rule), "16:15");
    assert.equal(roundTime("16:19", rule), "16:15");
    assert.equal(roundTime("16:20", rule), "16:30");
    assert.equal(roundTime("16:29", rule), "16:30");
  });

  test("named modes are grace presets", () => {
    assert.equal(roundTime("08:58", { mode: "down" }), "08:45");
    assert.equal(roundTime("08:46", { mode: "up" }), "09:00");
    assert.equal(roundTime("08:52", { mode: "nearest" }), "08:45");
    assert.equal(roundTime("08:53", { mode: "nearest" }), "09:00");
    assert.equal(roundTime("08:53", { mode: "none" }), "08:53");
  });

  test("rounding up past midnight wraps", () => {
    assert.equal(roundTime("23:59", { mode: "up" }), "00:00");
  });
});

describe("graceOf", () => {
  test("clamps custom grace to the grid", () => {
    assert.equal(graceOf({ mode: "custom", grace: 99 }), 14);
    assert.equal(graceOf({ mode: "custom", grace: -3 }), 0);
    assert.equal(graceOf({ mode: "none" }), null);
  });
});

test("describeRule is plain English", () => {
  assert.match(describeRule({ mode: "custom", grace: 4 }), /4 min past the quarter/);
});
