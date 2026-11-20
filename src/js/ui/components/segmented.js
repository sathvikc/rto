/** Segmented control: one pressed button per option. */
import { html } from "../dom.js";
import { actionButton } from "./button.js";

/** @typedef {ReadonlyArray<readonly [string, string]>} SegmentOptions  [value, label] pairs */

/**
 * The buttons, for a `.seg` container that already exists in the page.
 * The action receives the option's value as data-value.
 * @param {SegmentOptions} options
 * @param {string} active
 * @param {string} action
 */
export const segmentButtons = (options, active, action) =>
  html`${options.map(([value, label]) => actionButton(label, action, { className: "seg__btn", value, pressed: value === active }))}`;

/**
 * A whole segmented control.
 * @param {object} props
 * @param {SegmentOptions} props.options
 * @param {string} props.active
 * @param {string} props.action
 * @param {string} props.label  Accessible name of the group.
 * @param {boolean} [props.full]  Stretch to the container's width.
 */
export const segmented = ({ options, active, action, label, full = false }) =>
  html`<div class="seg${full ? " seg--full" : ""}" role="group" aria-label="${label}">${segmentButtons(options, active, action)}</div>`;
