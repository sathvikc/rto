/** A card holding one chart and its title. */
import { html } from "../dom.js";

/** @import { SafeHtml } from "../dom.js" */

/**
 * @param {string} title
 * @param {SafeHtml} chart
 * @param {SafeHtml | string} [footnote]
 */
export const chartCard = (title, chart, footnote) =>
  html`<figure class="card chart-card">
    <figcaption class="chart-card__title">${title}</figcaption>
    ${chart} ${footnote && html`<p class="caption">${footnote}</p>`}
  </figure>`;
