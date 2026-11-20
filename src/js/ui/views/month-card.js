/** Home: the current month at a glance, and the average still needed. */
import { effect } from "lume-js";
import { startOfWeekSunday } from "../../domain/dates.js";
import { formatDateRange, formatDay, formatHours, formatPercent, monthLong, monthName, plural } from "../../lib/format.js";
import { model } from "../../state/model.js";
import { data, updateSettings } from "../../state/store.js";
import { registerActions } from "../actions.js";
import { statGrid } from "../components/stat-grid.js";
import { actionButton } from "../components/button.js";
import { byId, html, render } from "../dom.js";

const MAX_WORKDAYS = 31;

export function mountMonthCard() {
  const card = byId("month-card");

  /** @param {number} value */
  const setWorkdays = (value) =>
    updateSettings({ workdaysOverride: { key: model.currentKey, value: Math.max(0, Math.min(MAX_WORKDAYS, value)) } });

  registerActions({
    "workdays-dec": () => setWorkdays(model.left - 1),
    "workdays-inc": () => setWorkdays(model.left + 1),
    "workdays-reset": () => updateSettings({ workdaysOverride: null }),
  });

  return effect(() => {
    const { currentKey, currentStat: st, needed, left, autoLeft, autoLeftDates } = model;
    const { target, workdaysOverride } = data.settings;

    if (!currentKey) return;

    const overridden = workdaysOverride?.key === currentKey;

    // A tracking month can run into the next calendar month: say so, or the
    // count looks wrong ("Includes Dec 1–4: that week starts Nov 29").
    const spill = autoLeftDates.filter((d) => d.slice(0, 7) !== currentKey);

    const spillNote =
      spill.length > 0 && !overridden
        ? `Includes ${formatDateRange(spill[0], spill[spill.length - 1])}: that week starts ${formatDay(startOfWeekSunday(spill[0]), { year: false })}, so it counts toward ${monthLong(currentKey)}.`
        : "";

    const onTrack = st?.avg != null && st.avg >= target;

    render(
      card,
      html`<header class="cluster cluster--between cluster--baseline">
          <h2 class="month-card__title">${monthName(currentKey)}</h2>
          ${actionButton("Details", "go-history", { className: "link-btn text-small" })}
        </header>

        ${statGrid([
          {
            label: "Average",
            value: html`${formatHours(st?.avg, 1)}${!!st?.unverifiedAvg && html`<sup class="star">*</sup>`}`,
            className: onTrack ? "text-ok" : "",
          },
          { label: "Presence", value: formatPercent(st?.presencePct) },
          { label: "Office days", value: st?.counted ?? 0 },
        ])}

        <div class="cluster cluster--between cluster--top month-card__needed">
          <div>
            <p class="caption">Needed per day</p>
            <p class="figure">${formatHours(needed, 1)}</p>
          </div>
          <div class="text-end">
            <p class="caption">Office days left</p>
            <div class="stepper">
              ${actionButton("−", "workdays-dec", { className: "icon-btn icon-btn--small", label: "Fewer office days left" })}
              <output class="stepper__value" aria-live="polite">${left}</output>
              ${actionButton("+", "workdays-inc", { className: "icon-btn icon-btn--small", label: "More office days left" })}
            </div>
            ${overridden && actionButton(`Reset to ${autoLeft}`, "workdays-reset", { className: "link-btn text-small" })}
          </div>
        </div>

        <p class="caption">
          ${left > 0 ? `To finish at ${target}h over ${plural(left, "more office day")}.` : "No office days left this month."}
          ${!!st?.unverifiedAvg && html` <span class="star">*</span> ${plural(st.unverifiedAvg, "day")} not verified.`}
        </p>
        ${spillNote && html`<p class="caption">${spillNote}</p>`}`,
    );
  });
}
