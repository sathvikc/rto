/** Segmented control: one pressed button per option. */
import { html } from "../dom.js";
import { actionButton } from "./button.js";

/**
 * Buttons for a `.seg` container. The action receives the option's value
 * as data-value.
 * @param {ReadonlyArray<readonly [string, string]>} options  [value, label]
 * @param {string} active
 * @param {string} action
 */
export const segmentButtons = (options, active, action) =>
  html`${options.map(([value, label]) => actionButton(label, action, { className: "seg__btn", value, pressed: value === active }))}`;
