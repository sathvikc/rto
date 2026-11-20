/** Home: the current month at a glance, and the average still needed. */
import { effect } from "lume-js";
import { startOfWeekSunday } from "../../domain/dates.js";
import { formatDateRange, formatDay, formatHours, monthLong, monthName, plural } from "../../lib/format.js";
import { model } from "../../state/model.js";
import { data, updateSettings } from "../../state/store.js";
import { registerActions } from "../actions.js";
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
      html`<header class="month-card__head">
          <h2 class="month-card__title">${monthName(currentKey)}</h2>
          <button type="button" class="link-btn text-small" data-action="go-history">Details</button>
        </header>

        <dl class="stat-grid">
          <div class="stat-grid__item">
            <dt>Average</dt>
            <dd class="${onTrack ? "text-ok" : ""}">
              ${st?.avg == null ? "—" : formatHours(st.avg, 1)}${st?.unverifiedAvg ? html`<sup class="star">*</sup>` : ""}
            </dd>
          </div>
          <div class="stat-grid__item">
            <dt>Presence</dt>
            <dd>${st?.presencePct == null ? "—" : `${st.presencePct}%`}</dd>
          </div>
          <div class="stat-grid__item">
            <dt>Office days</dt>
            <dd>${st?.counted ?? 0}</dd>
          </div>
        </dl>

        <div class="month-card__needed">
          <div>
            <p class="text-dim text-small">Needed per day</p>
            <p class="figure">${needed === null ? "—" : formatHours(needed, 1)}</p>
          </div>
          <div class="text-end">
            <p class="text-dim text-small">Office days left</p>
            <div class="stepper">
              <button type="button" class="round-btn" data-action="workdays-dec" aria-label="Fewer office days left">−</button>
              <output class="stepper__value" aria-live="polite">${left}</output>
              <button type="button" class="round-btn" data-action="workdays-inc" aria-label="More office days left">+</button>
            </div>
            ${
              overridden &&
              html`<button type="button" class="link-btn text-small" data-action="workdays-reset">Reset to ${autoLeft}</button>`
            }
          </div>
        </div>

        <p class="text-dim text-small">
          ${left > 0 ? `To finish at ${target}h over ${plural(left, "more office day")}.` : "No office days left this month."}
          ${!!st?.unverifiedAvg && html` <span class="star">*</span> ${plural(st.unverifiedAvg, "day")} not verified.`}
        </p>
        ${spillNote && html`<p class="text-dim text-small">${spillNote}</p>`}`,
    );
  });
}
