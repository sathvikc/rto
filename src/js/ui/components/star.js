/** The * that marks numbers not yet checked against the timesheet. */
import { html } from "../dom.js";

/** @import { SafeHtml } from "../dom.js" */

/** Superscript mark after a number. */
export const unverifiedMark = () => html`<sup class="star" title="Not verified">*</sup>`;

/**
 * "* 3 days not verified." style footnote text.
 * @param {string | SafeHtml} text
 */
export const starNote = (text) => html`<span class="star">*</span> ${text}`;
