import assert from "node:assert/strict";
import { test } from "node:test";
import { formatHours, formatTime, monthName, plural } from "../src/js/lib/format.js";
import { escapeHtml, html } from "../src/js/ui/dom.js";

test("formatTime and formatHours", () => {
  assert.equal(formatTime("16:05"), "4:05 PM");
  assert.equal(formatTime("00:30"), "12:30 AM");
  assert.equal(formatTime(null), "—");
  assert.equal(formatHours(7.75), "7.75h");
  assert.equal(formatHours(7.37), "7.4h");
  assert.equal(formatHours(8.25, 1), "8.3h");
  assert.equal(formatHours(null), "—");
});

test("monthName and plural", () => {
  assert.equal(monthName("2026-11"), "Nov 2026");
  assert.equal(plural(1, "day"), "1 day");
  assert.equal(plural(2, "mismatch", "mismatches"), "2 mismatches");
});

test("html escapes interpolations and keeps nested templates", () => {
  const note = `<img src=x onerror="alert(1)">`;
  const out = html`<p title="${note}">${note}${html`<b>ok</b>`}${[html`<i>1</i>`, "<2>"]}${false}${null}${0}</p>`;

  assert.equal(out.value, `<p title="${escapeHtml(note)}">${escapeHtml(note)}<b>ok</b><i>1</i>&lt;2&gt;0</p>`);
});

test("boolean attributes need String(): false renders nothing", () => {
  assert.equal(html`<b aria-pressed="${false}"></b>`.value, `<b aria-pressed=""></b>`);
  assert.equal(html`<b aria-pressed="${String(false)}"></b>`.value, `<b aria-pressed="false"></b>`);
});
