/** Small colored label, e.g. a day type. */
import { html } from "../dom.js";

/**
 * @param {string} text
 * @param {string} [tone]  Modifier: a day status ("wfh", "ooo", "sick", "holiday") or "open".
 */
export const badge = (text, tone) => html`<span class="badge${tone ? ` badge--${tone}` : ""}">${text}</span>`;
