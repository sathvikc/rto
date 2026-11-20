/**
 * Small responsive SVG bar chart. Colors come from CSS custom properties,
 * so it follows the light/dark theme without re-rendering.
 */
import { html } from "../dom.js";

/**
 * @typedef {object} Bar
 * @property {string} label    Axis label.
 * @property {number | null} value
 * @property {string} text     Value label above the bar.
 * @property {boolean} [faded] e.g. the month in progress.
 */

const WIDTH = 340;
const HEIGHT = 190;
const PAD = { top: 20, right: 4, bottom: 26, left: 4 };
const GRID_LINES = [0.25, 0.5, 0.75, 1];

/** @param {number} count */
const fontSize = (count) => (count > 14 ? 8 : count > 9 ? 9 : 11);

/**
 * @param {Bar[]} bars
 * @param {{ max?: number, color: string, label: string }} options
 */
export function barChart(bars, { max, color, label }) {
  const plotH = HEIGHT - PAD.top - PAD.bottom;
  const plotW = WIDTH - PAD.left - PAD.right;
  const peak = max ?? Math.max(1, ...bars.map((b) => b.value ?? 0)) * 1.12;
  const slot = plotW / bars.length;
  const barW = Math.max(4, Math.min(34, slot * 0.64));
  const fs = fontSize(bars.length);
  /** @param {number} f */
  const yAt = (f) => PAD.top + plotH * (1 - f);

  return html`<svg class="chart" viewBox="0 0 ${WIDTH} ${HEIGHT}" role="img" aria-label="${label}">
    ${GRID_LINES.map((f) => html`<line class="chart__grid" x1="${PAD.left}" x2="${WIDTH - PAD.right}" y1="${yAt(f)}" y2="${yAt(f)}" />`)}
    <line class="chart__baseline" x1="${PAD.left}" x2="${WIDTH - PAD.right}" y1="${yAt(0)}" y2="${yAt(0)}" />
    ${bars.map((bar, i) => {
      const cx = PAD.left + slot * i + slot / 2;
      const h = bar.value === null ? 0 : Math.max(1.5, (bar.value / peak) * plotH);
      const y = yAt(0) - h;
      return html`<g>
        <title>${bar.label}: ${bar.text || "no data"}</title>
        <rect x="${cx - barW / 2}" y="${y}" width="${barW}" height="${h}" rx="3" fill="${color}" opacity="${bar.faded ? 0.5 : 1}" />
        ${bar.value !== null && html`<text class="chart__value" x="${cx}" y="${y - 5}" text-anchor="middle" font-size="${fs}">${bar.text}</text>`}
        <text class="chart__axis" x="${cx}" y="${HEIGHT - 8}" text-anchor="middle" font-size="${fs}">${bar.label}</text>
      </g>`;
    })}
  </svg>`;
}
