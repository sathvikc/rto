/**
 * Components for index.html, as custom elements with props in attributes:
 *
 *   <ui-field label="Clock in"><input id="f-rstart" class="input" type="time" /></ui-field>
 *
 * Each element expands once, on load, into plain markup built by the same
 * components the views use (ui/components/), and replaces itself. Its
 * children move into the <slot> of that markup. So the page ends up with
 * ordinary elements, CSS and bindings see no custom tags, and changing a
 * component changes every place that uses it.
 *
 * Import this module before any view mounts.
 */
import { actionButton, button, closeButton } from "./components/button.js";
import { icon, isIconName } from "./components/icon.js";
import { html, trusted } from "./dom.js";

/** @import { SafeHtml } from "./dom.js" */

const SLOT = trusted("<slot></slot>");

/**
 * Registers <name>: build() turns the element's attributes into markup.
 * @param {string} name
 * @param {(el: HTMLElement, prop: (name: string) => string) => SafeHtml} build
 */
function defineComponent(name, build) {
  customElements.define(
    name,
    class extends HTMLElement {
      connectedCallback() {
        const template = document.createElement("template");

        template.innerHTML = build(this, (prop) => this.getAttribute(prop) ?? "").value;
        template.content.querySelector("slot")?.replaceWith(...this.childNodes);
        this.replaceWith(template.content);
      }
    },
  );
}

/** ` data-show="key"`, for the visibility handler, when given. @param {string} key */
const showAttr = (key) => (key ? trusted(` data-show="${key}"`) : "");

/** ` data-bind="key"` when given. @param {string} key */
const bindAttr = (key) => (key ? trusted(` data-bind="${key}"`) : "");

/* ---- Navigation ---- */

// <ui-tab-link tab="home" label="Home">
defineComponent("ui-tab-link", (_, prop) => {
  const tab = prop("tab");

  return html`<a class="tabbar__item" href="#${tab}" data-tab-link="${tab}">
    ${isIconName(tab) && icon(/** @type {import("./components/icon.js").IconName} */ (tab), "tabbar__icon")}
    <span>${prop("label")}</span>
  </a>`;
});

// <ui-tab-header heading="History" heading-id="history-title">[action]</ui-tab-header>
defineComponent(
  "ui-tab-header",
  (_, prop) =>
    html`<header class="tab__header cluster cluster--between">
      <h2 id="${prop("heading-id")}" class="tab__title">${prop("heading")}</h2>
      ${SLOT}
    </header>`,
);

/* ---- Settings ---- */

// <ui-setting heading="Backup" heading-id="s-backup-heading" [heading-bind] [variant="help"]>
defineComponent("ui-setting", (_, prop) => {
  const id = prop("heading-id");
  const variant = prop("variant");

  return html`<section class="card settings__group${variant ? ` ${variant}` : ""}" aria-labelledby="${id}">
    <h3 id="${id}" class="settings__heading" ${bindAttr(prop("heading-bind"))}>${prop("heading")}</h3>
    ${SLOT}
  </section>`;
});

// <ui-help summary="Rounding"><p>…</p></ui-help>
defineComponent(
  "ui-help",
  (_, prop) =>
    html`<details class="help__item">
      <summary>${prop("summary")}</summary>
      ${SLOT}
    </details>`,
);

/* ---- Sheets (dialogs) ---- */

// <ui-sheet-head heading-id="day-title" [heading="…"] [heading-bind="title"]>
defineComponent(
  "ui-sheet-head",
  (_, prop) =>
    html`<header class="sheet__head cluster cluster--between">
      <h2 id="${prop("heading-id")}" class="sheet__title" ${bindAttr(prop("heading-bind"))}>${prop("heading")}</h2>
      ${closeButton()}
    </header>`,
);

// <ui-sheet-actions [cancel="Keep"] primary="Delete" [primary-action="confirm-delete"] [primary-bind] [danger]>
// Without primary-action the primary button submits the form.
defineComponent("ui-sheet-actions", (el, prop) => {
  const action = prop("primary-action");

  return html`<div class="sheet__actions">
    ${actionButton(prop("cancel") || "Cancel", "close-dialog")}
    ${button(prop("primary"), {
      action: action || undefined,
      type: action ? "button" : "submit",
      className: `btn ${el.hasAttribute("danger") ? "btn--danger" : "btn--primary"}`,
      bind: prop("primary-bind") || undefined,
    })}
  </div>`;
});

/* ---- Form fields ---- */

// <ui-field label="Clock in" [label-bind="key"] [note="(no times)"] [note-bind="key"] [show="key"]>control(s)</ui-field>
// The label points at the first control. A field holding a button group
// (role="group") gets a text label that names the group and its inputs.
defineComponent("ui-field", (el, prop) => {
  const group = el.querySelector('[role="group"]');
  const note = prop("note");
  const noteBind = prop("note-bind");

  const text = html`${prop("label")}${(note || noteBind) && html` <span class="text-dim" ${bindAttr(noteBind)}>${note}</span>`}`;

  let label;

  if (group) {
    const id = `${group.id}-label`;

    for (const control of el.querySelectorAll('[role="group"], input:not([aria-label])')) control.setAttribute("aria-labelledby", id);

    label = html`<span class="field__label" id="${id}">${text}</span>`;
  } else {
    label = html`<label class="field__label" for="${el.querySelector("input, select, textarea")?.id ?? ""}" ${bindAttr(prop("label-bind"))}
      >${text}</label
    >`;
  }

  return html`<div class="field" ${showAttr(prop("show"))}>${label} ${SLOT}</div>`;
});
