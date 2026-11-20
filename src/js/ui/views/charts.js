/** Average hours and presence charts, by month (selected year) or by year. */
import { effect } from "lume-js";
import { createCleanupGroup } from "lume-js/addons";
import { combineStats } from "../../domain/stats.js";
import { monthShort } from "../../lib/format.js";
import { model } from "../../state/model.js";
import { ui } from "../../state/store.js";
import { registerActions } from "../actions.js";
import { barChart } from "../components/bar-chart.js";
import { byId, html, render, segmentButtons } from "../dom.js";

/** @import { MonthStat } from "../../domain/types.js" */
/** @import { ChartGroup } from "../../state/store.js" */

/** @typedef {{ label: string, avg: number | null, pct: number | null, partial: boolean }} Point */

const GROUP_OPTIONS = /** @type {const} */ ([
  ["month", "By month"],
  ["year", "By year"],
]);

/**
 * @param {MonthStat[]} stats
 * @returns {Point[]}
 */
function byYear(stats) {
  /** @type {Map<string, MonthStat[]>} */
  const years = new Map();

  for (const s of stats) {
    const y = s.key.slice(0, 4);

    years.set(y, [...(years.get(y) ?? []), s]);
  }

  return [...years.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([year, list]) => {
      const c = combineStats(list);

      return { label: year, avg: c.avg, pct: c.presencePct, partial: c.partial };
    });
}

/**
 * @param {MonthStat[]} stats
 * @param {string} year
 * @returns {Point[]}
 */
const byMonth = (stats, year) =>
  stats
    .filter((s) => s.key.startsWith(year))
    .map((s) => ({ label: monthShort(Number(s.key.slice(5)) - 1), avg: s.avg, pct: s.presencePct, partial: s.partial }));

export function mountCharts() {
  const group = createCleanupGroup();
  const toggle = byId("chart-group");
  const root = byId("charts");

  group.add(
    effect(() => {
      const { stats, selKey, currentKey } = model;
      const mode = ui.chartGroup;

      render(toggle, html`${segmentButtons(GROUP_OPTIONS, mode, "chart-group")}`);

      const year = (selKey || currentKey).slice(0, 4);
      const points = mode === "year" ? byYear(stats) : byMonth(stats, year);
      const scope = mode === "year" ? "by year" : `by month · ${year}`;

      if (!points.length) {
        render(root, html`<div class="card empty">Charts appear once you log a few days.</div>`);

        return;
      }

      render(
        root,
        html`<figure class="card chart-card">
            <figcaption class="chart-card__title">Average hours ${scope}</figcaption>
            ${barChart(
              points.map((p) => ({ label: p.label, value: p.avg, text: p.avg === null ? "" : p.avg.toFixed(1), faded: p.partial })),
              { color: "var(--color-accent)", label: `Average hours ${scope}` },
            )}
          </figure>
          <figure class="card chart-card">
            <figcaption class="chart-card__title">Presence ${scope}</figcaption>
            ${barChart(
              points.map((p) => ({ label: p.label, value: p.pct, text: p.pct === null ? "" : `${p.pct}%`, faded: p.partial })),
              { max: 112, color: "var(--color-info)", label: `Presence percent ${scope}` },
            )}
            <p class="text-dim text-small">Faded bar = month in progress.</p>
          </figure>`,
      );
    }),
  );

  registerActions({
    "chart-group": (el) => {
      ui.chartGroup = /** @type {ChartGroup} */ (el.dataset.value);
    },
  });

  return () => group.dispose();
}
