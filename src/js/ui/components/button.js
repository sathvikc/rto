/** Buttons. Every <button> in the app is built here, so one fix applies everywhere. */
import { escapeHtml, html, trusted } from "../dom.js";

/** @import { SafeHtml } from "../dom.js" */

/**
 * @typedef {object} ButtonProps
 * @property {string} [action]  Name registered with registerActions().
 * @property {"button" | "submit"} [type]  Defaults to "button".
 * @property {string} [className]  Defaults to "btn".
 * @property {string | number} [value]  Sent as data-value.
 * @property {string} [date]  Sent as data-date.
 * @property {boolean} [pressed]  aria-pressed, for two-state buttons.
 * @property {string} [title]
 * @property {string} [label]  aria-label, when the text alone is unclear.
 * @property {string} [bind]  Store key for the text (data-bind).
 */

/**
 * ` name="value"`, or nothing when the value is missing.
 * @param {string} name
 * @param {string | number | boolean | undefined} value
 */
export const attr = (name, value) => (value === undefined || value === "" ? "" : trusted(` ${name}="${escapeHtml(String(value))}"`));

/**
 * @param {string | SafeHtml} content
 * @param {ButtonProps} [props]
 */
export const button = (content, { action, type = "button", className = "btn", value, date, pressed, title, label, bind } = {}) =>
  html`<button
    type="${type}"
    class="${className}"
    ${attr("data-action", action)}${attr("data-value", value)}${attr("data-date", date)}${attr("aria-pressed", pressed)}${attr("title", title)}${attr("aria-label", label)}${attr("data-bind", bind)}
  >
    ${content}
  </button>`;

/**
 * Shorthand for the common case: a button that runs an action.
 * @param {string | SafeHtml} content
 * @param {string} action
 * @param {Omit<ButtonProps, "action">} [props]
 */
export const actionButton = (content, action, props = {}) => button(content, { ...props, action });

/** Small pill button for a day row (History, timesheet check). */
export const DAY_BUTTON = "btn btn--pill btn--small";

/**
 * "Edit" for one day: opens the day sheet.
 * @param {string} date
 */
export const editDayButton = (date) => actionButton("Edit", "edit-day", { className: DAY_BUTTON, date });

/** × that closes the open sheet. */
export const closeButton = () => actionButton("×", "close-dialog", { className: "icon-btn icon-btn--small", label: "Close" });
