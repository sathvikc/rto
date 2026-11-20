import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { badge } from "../../src/js/ui/components/badge.js";
import { actionButton, button } from "../../src/js/ui/components/button.js";
import { emptyState } from "../../src/js/ui/components/empty-state.js";
import { segmentButtons, segmented } from "../../src/js/ui/components/segmented.js";
import { selectOptions } from "../../src/js/ui/components/select-options.js";

/** Collapse whitespace so assertions don't depend on template formatting. @param {{ value: string }} markup */
const flat = (markup) => markup.value.replace(/\s+/g, " ").replace(/ >/g, ">").replace(/>\s+</g, "><").trim();

describe("button", () => {
  it("renders only the props it is given", () => {
    assert.equal(
      flat(actionButton("Edit", "edit-day", { date: "2026-11-20" })),
      '<button type="button" class="btn" data-action="edit-day" data-date="2026-11-20"> Edit </button>',
    );
  });

  it("submits without an action, and binds its text", () => {
    assert.equal(
      flat(button("", { type: "submit", className: "btn btn--primary", bind: "saveLabel" })),
      '<button type="submit" class="btn btn--primary" data-bind="saveLabel"></button>',
    );
  });

  it("escapes text and attribute values", () => {
    const out = flat(actionButton("<b>", "x", { label: 'say "hi"' }));

    assert.match(out, /aria-label="say &quot;hi&quot;"/);
    assert.match(out, /&lt;b&gt;/);
  });

  it("writes aria-pressed for false too", () => {
    assert.match(flat(actionButton("A", "x", { pressed: false })), /aria-pressed="false"/);
  });
});

describe("segmented", () => {
  const options = /** @type {const} */ ([
    ["a", "One"],
    ["b", "Two"],
  ]);

  it("presses only the active option", () => {
    const out = flat(segmentButtons(options, "b", "pick"));

    assert.equal((out.match(/aria-pressed="true"/g) ?? []).length, 1);
    assert.match(out, /aria-pressed="true"> Two/);
  });

  it("wraps the buttons in a labelled group", () => {
    assert.match(
      flat(segmented({ options, active: "a", action: "pick", label: "Choice", full: true })),
      /^<div class="seg seg--full" role="group" aria-label="Choice">/,
    );
  });
});

describe("selectOptions", () => {
  it("marks the selected value, numbers included", () => {
    const out = flat(
      selectOptions(
        [
          [0, "0 min"],
          [4, "4 min"],
        ],
        4,
      ),
    );

    assert.equal(out, '<option value="0">0 min</option><option value="4" selected>4 min</option>');
  });
});

describe("emptyState", () => {
  it("renders as a list item with actions and a hint", () => {
    const out = flat(emptyState({ tag: "li", compact: true, text: "Nothing", actions: actionButton("Add", "add"), hint: "Tip" }));

    assert.match(out, /^<li class="empty empty--compact"><p>Nothing<\/p>/);
    assert.match(out, /cluster--center/);
    assert.match(out, /<p class="field__hint">Tip<\/p><\/li>$/);
  });

  it("leaves out missing parts", () => {
    assert.equal(flat(emptyState({ text: "Nothing" })), '<div class="empty"><p>Nothing</p></div>');
  });
});

describe("badge", () => {
  it("adds the tone modifier only when given", () => {
    assert.equal(flat(badge("Today")), '<span class="badge">Today</span>');
    assert.equal(flat(badge("WFH", "wfh")), '<span class="badge badge--wfh">WFH</span>');
  });
});
