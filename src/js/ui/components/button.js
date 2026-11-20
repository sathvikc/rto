/** Buttons wired to the action registry (ui/actions.js). */
import { escapeHtml, html, trusted } from "../dom.js";

/** @import { SafeHtml } from "../dom.js" */

/**
 * @typedef {object} ButtonOptions
 * @property {string} [className]  Defaults to "btn".
 * @property {string | number} [value]  Sent as data-value.
 * @property {string} [date]  Sent as data-date.
 * @property {boolean} [pressed]  aria-pressed, for two-state buttons.
 * @property {string} [title]
 * @property {string} [label]  aria-label, when the text alone is unclear.
 */

/**
 * ` name="value"`, or nothing when the value is missing.
 * @param {string} name
 * @param {string | number | boolean | undefined} value
 */
const attr = (name, value) => (value === undefined ? "" : trusted(` ${name}="${escapeHtml(String(value))}"`));

/**
 * @param {string | SafeHtml} content
 * @param {string} action
 * @param {ButtonOptions} [options]
 */
export const actionButton = (content, action, { className = "btn", value, date, pressed, title, label } = {}) =>
  html`<button
    type="button"
    class="${className}"
    data-action="${action}"
    ${attr("data-value", value)}${attr("data-date", date)}${attr("aria-pressed", pressed)}${attr("title", title)}${attr("aria-label", label)}
  >
    ${content}
  </button>`;

/** Small pill button for a day row (History, timesheet check). */
export const DAY_BUTTON = "btn btn--pill btn--small";

/**
 * "Edit" for one day: opens the day sheet.
 * @param {string} date
 */
export const editDayButton = (date) => actionButton("Edit", "edit-day", { className: DAY_BUTTON, date });
