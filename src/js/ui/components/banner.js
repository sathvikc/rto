/** Home banner: a title, one line of detail and one action. */
import { html } from "../dom.js";

/** @import { SafeHtml } from "../dom.js" */

/**
 * @param {object} banner
 * @param {"warn" | "muted"} [banner.tone]  Default: highlighted.
 * @param {string | SafeHtml} banner.title
 * @param {string | SafeHtml} banner.text
 * @param {SafeHtml} banner.action  Usually an actionButton().
 */
export const banner = ({ tone, title, text, action }) =>
  html`<div class="banner cluster cluster--between${tone ? ` banner--${tone}` : ""}">
    <div>
      <p class="banner__title">${title}</p>
      <p class="caption">${text}</p>
    </div>
    ${action}
  </div>`;
