/** <option> lists for selects. */
import { html } from "../dom.js";

/**
 * @param {ReadonlyArray<readonly [string | number, string]>} options  [value, label]
 * @param {string | number | null} [selected]  Nothing selected when missing.
 */
export const selectOptions = (options, selected) =>
  html`${options.map(([value, label]) => html`<option value="${value}" ${value === selected && "selected"}>${label}</option>`)}`;
