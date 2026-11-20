/** Row of small labelled figures (Average · Presence · Office days …). */
import { html } from "../dom.js";

/** @import { SafeHtml } from "../dom.js" */

/**
 * @typedef {object} Stat
 * @property {string} label
 * @property {string | number | SafeHtml} value
 * @property {string} [className]  e.g. "text-ok"
 */

/** @param {Stat[]} stats */
export const statGrid = (stats) =>
  html`<dl class="stat-grid">
    ${stats.map(
      (s) =>
        html`<div class="stat-grid__item">
          <dt>${s.label}</dt>
          <dd class="${s.className ?? ""}">${s.value}</dd>
        </div>`,
    )}
  </dl>`;
