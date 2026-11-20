/** Month picker, monthly summary card and "daily average needed" card. */
import { batch, effect } from "lume-js";
import { createCleanupGroup } from "lume-js/addons";
import { formatHours, monthName, plural } from "../../lib/format.js";
import { model } from "../../state/model.js";
import { data, ui, updateSettings } from "../../state/store.js";
import { registerActions } from "../actions.js";
import { byId, html, render } from "../dom.js";

const MAX_WORKDAYS = 31;

export function mountSummary() {
  const group = createCleanupGroup();
  const monthSelect = byId("month-select", HTMLSelectElement);
  const summary = byId("summary");
  const needed = byId("needed");
  const target = byId("target-input", HTMLInputElement);

  group.add(
    effect(() => {
      const { monthKeys, selKey } = model;
      render(monthSelect, html`${monthKeys.map((k) => html`<option value="${k}">${monthName(k)}</option>`)}`);
      monthSelect.value = selKey;
    }),
  );

  group.add(
    effect(() => {
      const { selStat: st, selKey, currentKey } = model;
      const { grouping } = data.settings;
      if (!selKey) return;
      render(
        summary,
        html`<p class="text-dim">
            ${selKey === currentKey ? "This month" : monthName(selKey)} · daily average
            <span class="text-small">(${grouping} month)</span>
          </p>
          <p class="figure">${st?.avg == null ? "—" : formatHours(st.avg, 1)}${st?.unverifiedAvg ? html`<sup class="star">*</sup>` : ""}</p>
          <dl class="stat-grid">
            <div class="stat-grid__item">
              <dt>Office days</dt>
              <dd>${st?.counted ?? 0}</dd>
            </div>
            <div class="stat-grid__item">
              <dt>Presence</dt>
              <dd>${st?.presencePct == null ? "—" : `${st.presencePct}%`}</dd>
            </div>
            <div class="stat-grid__item">
              <dt>WFH</dt>
              <dd>${st?.wfh ?? 0}</dd>
            </div>
          </dl>
          ${!!st?.denom && html`<p class="text-dim text-small">${st.present} of ${st.denom} weekdays present in the weeks logged (holidays excluded).</p>`}
          ${
            !!st?.unverified &&
            html`<p class="text-dim text-small">
              <span class="star">*</span> ${plural(st.unverified, "day")} not yet verified against the
              timesheet${st.unverifiedAvg ? ` (${st.unverifiedAvg} in the average)` : ""}.
            </p>`
          }`,
      );
    }),
  );

  group.add(
    effect(() => {
      const { needed: avgNeeded, left, autoLeft, selKey, currentKey, selStat: st } = model;
      const { target: goal, workdaysOverride } = data.settings;
      if (!selKey) return;

      if (selKey < currentKey) {
        const verdict =
          st?.avg == null
            ? "No office hours that month."
            : st.avg >= goal
              ? `At or above the ${goal}h target.`
              : `${formatHours(goal - st.avg, 1)} under the ${goal}h target.`;
        render(
          needed,
          html`<p class="text-dim">${monthName(selKey)} is closed</p>
            <p class="figure">${st?.avg == null ? "—" : formatHours(st.avg, 1)}</p>
            <p class="text-dim text-small">${verdict}</p>`,
        );
        return;
      }

      const overridden = workdaysOverride?.key === selKey;
      render(
        needed,
        html`<div class="cluster cluster--between cluster--top">
            <div>
              <p class="text-dim">Daily average needed</p>
              <p class="figure">${avgNeeded === null ? "—" : formatHours(avgNeeded, 1)}</p>
            </div>
            <div class="text-end">
              <p class="text-dim">Workdays left</p>
              <div class="stepper">
                <button type="button" class="round-btn" data-action="workdays-dec" aria-label="Fewer workdays left">−</button>
                <output class="stepper__value" aria-live="polite">${left}</output>
                <button type="button" class="round-btn" data-action="workdays-inc" aria-label="More workdays left">+</button>
              </div>
              <p class="text-dim text-small">
                Auto ${autoLeft}${overridden && html` · <button type="button" class="link-btn" data-action="workdays-reset">Reset</button>`}
              </p>
            </div>
          </div>
          <p class="text-dim text-small">
            ${
              left > 0
                ? `Average ${formatHours(avgNeeded ?? 0, 1)} on the next ${plural(left, "office day")} to finish the month at ${goal}h.`
                : "No workdays left to plan."
            }
            Auto skips weekends, holidays and days already marked WFH, OOO or Sick.
          </p>`,
      );
    }),
  );

  group.add(
    effect(() => {
      if (document.activeElement !== target) target.value = String(data.settings.target);
    }),
  );

  const onMonthChange = () =>
    batch(() => {
      ui.monthSel = monthSelect.value;
      ui.yearSel = null;
    });
  const commitTarget = () => {
    const value = Number(target.value.trim());
    if (Number.isFinite(value) && value > 0 && value <= 24) updateSettings({ target: value });
    else target.value = String(data.settings.target);
  };
  /** @param {KeyboardEvent} e */
  const blurOnEnter = (e) => {
    if (e.key === "Enter") target.blur();
  };
  monthSelect.addEventListener("change", onMonthChange);
  target.addEventListener("change", commitTarget);
  target.addEventListener("keydown", blurOnEnter);
  group.add(() => {
    monthSelect.removeEventListener("change", onMonthChange);
    target.removeEventListener("change", commitTarget);
    target.removeEventListener("keydown", blurOnEnter);
  });

  /** @param {number} value */
  const setWorkdays = (value) =>
    updateSettings({ workdaysOverride: { key: model.selKey, value: Math.max(0, Math.min(MAX_WORKDAYS, value)) } });
  registerActions({
    "workdays-dec": () => setWorkdays(model.left - 1),
    "workdays-inc": () => setWorkdays(model.left + 1),
    "workdays-reset": () => updateSettings({ workdaysOverride: null }),
  });

  return () => group.dispose();
}
