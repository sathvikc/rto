/** History list: day cards filtered by week, selected month, or year. */
import { effect, state } from "lume-js";
import { createCleanupGroup, repeat } from "lume-js/addons";
import { STATUS_LABEL } from "../../domain/constants.js";
import { addDays, groupKey, startOfWeekMonday } from "../../domain/dates.js";
import { canToggleMatch, isVerified, predictEntry, resolveDay } from "../../domain/days.js";
import { isTime } from "../../domain/time.js";
import { formatDay, formatHours, formatTime, monthName, plural } from "../../lib/format.js";
import { model } from "../../state/model.js";
import { data, toggleMatch, ui, verifyAsPredicted } from "../../state/store.js";
import { registerActions } from "../actions.js";
import { byId, html, render, segmentButtons } from "../dom.js";

/** @import { Day, Settings } from "../../domain/types.js" */
/** @import { HistoryFilter } from "../../state/store.js" */
/** @import { SafeHtml } from "../dom.js" */

const FILTER_OPTIONS = /** @type {const} */ ([
  ["week", "Week"],
  ["month", "Month"],
  ["all", "All"],
]);

/**
 * @param {Day} day
 * @param {Settings} settings
 * @param {string} today
 * @returns {SafeHtml}
 */
function dayCard(day, settings, today) {
  const r = resolveDay(day, settings);
  const { recorded: rec, actual: act } = day;
  const isPast = day.date <= today;
  const unverified = !r.verified && !r.open && isPast;

  const shown = r.verified && act && (act.start || act.end) ? act : rec;

  const timeLine =
    shown && (shown.start || shown.end)
      ? `${formatTime(shown.start)} → ${r.open ? "…" : formatTime(shown.end)}`
      : day.status === "office"
        ? r.total === null
          ? "No hours"
          : "No times"
        : day.status === "holiday"
          ? (day.note ?? "Company holiday")
          : STATUS_LABEL[day.status];

  /** @type {Array<SafeHtml | string>} */
  const details = [];

  const office = day.status === "office";

  if (office && r.verified && act) {
    const punchedDiffers = rec && isTime(rec.start) && isTime(rec.end) && (rec.start !== act.start || rec.end !== act.end);

    details.push(
      html`<span class="text-ok">✓ Timesheet</span
        >${punchedDiffers && rec && ` · you punched ${formatTime(rec.start)} → ${formatTime(rec.end)}`}`,
    );
  } else if (rec && isTime(rec.start) && isTime(rec.end)) {
    const p = predictEntry(rec, settings);

    details.push(
      `Predicted ${formatTime(p?.start)} → ${formatTime(p?.end)} · ${formatHours(p?.hours)} · ${isPast ? "not verified" : "planned"}`,
    );
  } else if (r.open) {
    details.push("Hours are calculated at clock-out");
  } else if (office && isPast) {
    details.push("Not verified");
  }

  if (day.status === "holiday" && day.observedFrom) details.push(`Observed for ${formatDay(day.observedFrom, { year: false })}`);

  if (r.pto !== null) details.push(`PTO ${formatHours(r.pto)}${r.work !== null ? ` · worked ${formatHours(r.work)}` : ""}`);

  const star = unverified ? html`<sup class="star" title="Not verified">*</sup>` : "";

  return html` <div class="cluster cluster--between cluster--top">
      <h3 class="day-card__date">${formatDay(day.date)}</h3>
      <div class="day-card__badges">
        ${day.date === today && html`<span class="badge">Today</span>`}
        ${day.status !== "office" && html`<span class="badge badge--${day.status}">${STATUS_LABEL[day.status]}</span>`}
        ${r.open && html`<span class="badge badge--open">In progress</span>`}
      </div>
    </div>
    <div class="cluster cluster--between cluster--baseline">
      <p class="day-card__times">${timeLine}</p>
      ${r.total !== null ? html`<span class="day-card__hours">${formatHours(r.total)}${star}</span>` : star}
    </div>
    ${details.map((d) => html`<p class="text-dim text-small">${d}</p>`)}
    ${day.note && day.status !== "holiday" && html`<p class="day-card__note text-small">${day.note}</p>`}
    <div class="cluster day-card__actions">
      <button type="button" class="btn btn--pill btn--small" data-action="edit-day" data-date="${day.date}">Edit</button>
      ${
        isPast &&
        canToggleMatch(day) &&
        html`<button
          type="button"
          class="btn btn--pill btn--small btn--toggle"
          aria-pressed="${String(r.verified)}"
          data-action="toggle-match"
          data-date="${day.date}"
          title="${r.verified ? "Matches the timesheet. Tap to undo." : "Mark as matching the timesheet"}"
        >
          ${r.verified ? "✓ Matched" : "Matches?"}
        </button>`
      }
      <button type="button" class="btn btn--pill btn--small text-danger" data-action="ask-delete" data-date="${day.date}">Delete</button>
    </div>`;
}

export function mountHistory() {
  const group = createCleanupGroup();
  const filterEl = byId("history-filter");
  const caption = byId("history-caption");
  const yearFilter = byId("year-filter");
  const yearSelect = byId("year-select", HTMLSelectElement);
  const empty = byId("history-empty");

  /** @type {{ items: Array<{ key: string, html: SafeHtml }> }} */
  const initialList = { items: [] };
  const list = state(initialList);

  group.add(
    effect(() => {
      const { days, settings } = data;
      const { filter, yearSel, today } = ui;
      const { selKey } = model;

      render(filterEl, html`${segmentButtons(FILTER_OPTIONS, filter, "history-filter")}`);

      const years = [...new Set(days.map((d) => d.date.slice(0, 4)))].sort().reverse();
      const fallbackYear = (selKey || today).slice(0, 4);

      const year =
        yearSel === "all" || (yearSel && years.includes(yearSel)) ? yearSel : years.includes(fallbackYear) ? fallbackYear : "all";

      render(
        yearSelect,
        html`<option value="all">All years</option>
          ${years.map((y) => html`<option value="${y}">${y}</option>`)}`,
      );

      yearSelect.value = year;
      yearFilter.hidden = filter !== "all";

      let rows = days;

      if (filter === "week") {
        const start = startOfWeekMonday(today);
        const end = addDays(start, 6);

        rows = days.filter((d) => d.date >= start && d.date <= end);
        caption.textContent = `${formatDay(start, { year: false })} – ${formatDay(end, { year: false })}`;
      } else if (filter === "month") {
        rows = days.filter((d) => groupKey(d.date, settings.grouping) === selKey);
        caption.textContent = selKey ? monthName(selKey) : "";
      } else {
        if (year !== "all") rows = days.filter((d) => d.date.startsWith(year));

        caption.textContent = plural(rows.length, "day");
      }

      // "Verified only" shows what the latest timesheet covers: verified
      // days up to its coverage date.
      if (ui.verifiedOnly) {
        const coverage = model.coverage;
        const shown = rows.filter((d) => d.date <= coverage && isVerified(d));
        const hidden = rows.length - shown.length;

        rows = shown;

        if (hidden)
          caption.textContent = `${caption.textContent} · ${plural(hidden, "day")} hidden (unverified or after ${formatDay(coverage, { year: false })})`;
      }

      list.items = rows.map((d) => ({ key: d.date, html: dayCard(d, settings, today) }));
      empty.hidden = rows.length > 0;
      empty.textContent = days.length ? "No days in this range." : "Nothing here yet. Clock in, or add a day with Manual entry.";
    }),
  );

  group.add(
    repeat(byId("history"), list, "items", {
      key: (item) => item.key,
      element: "article",
      render: (item, el) => {
        el.className = "card day-card";
        render(el, item.html);
      },
    }),
  );

  const onYearChange = () => {
    ui.yearSel = yearSelect.value;
  };

  yearSelect.addEventListener("change", onYearChange);
  group.add(() => yearSelect.removeEventListener("change", onYearChange));

  registerActions({
    "history-filter": (el) => {
      ui.filter = /** @type {HistoryFilter} */ (el.dataset.value);
    },
    "verify-day": (el) => verifyAsPredicted([el.dataset.date ?? ""]),
    "toggle-match": (el) => toggleMatch(el.dataset.date ?? ""),
  });

  return () => group.dispose();
}
