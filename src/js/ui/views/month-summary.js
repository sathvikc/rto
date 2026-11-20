/** History tab: month picker and that month's summary. */
import { batch, effect } from "lume-js";
import { createCleanupGroup } from "lume-js/addons";
import { formatHours, monthName, plural } from "../../lib/format.js";
import { model } from "../../state/model.js";
import { data, ui } from "../../state/store.js";
import { byId, html, render } from "../dom.js";

export function mountMonthSummary() {
  const group = createCleanupGroup();
  const select = byId("month-select", HTMLSelectElement);
  const summary = byId("month-summary");

  group.add(
    effect(() => {
      const { monthKeys, selKey } = model;

      render(select, html`${monthKeys.map((k) => html`<option value="${k}">${monthName(k)}</option>`)}`);
      select.value = selKey;
    }),
  );

  group.add(
    effect(() => {
      const { selStat: st, selKey, currentKey } = model;
      const { target, grouping } = data.settings;

      if (!selKey) return;

      const verdict =
        st?.avg == null
          ? ""
          : st.avg >= target
            ? `At or above the ${target}h target.`
            : `${formatHours(target - st.avg, 1)} under the ${target}h target${selKey === currentKey ? " so far" : ""}.`;

      render(
        summary,
        html`<p class="text-dim text-small">${selKey === currentKey ? "This month" : monthName(selKey)} · ${grouping} month</p>
          <p class="figure">${st?.avg == null ? "—" : formatHours(st.avg, 1)}${st?.unverifiedAvg ? html`<sup class="star">*</sup>` : ""}</p>
          <p class="text-dim text-small">${verdict}</p>
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
          ${!!st?.denom && html`<p class="text-dim text-small">${st.present} of ${st.denom} weekdays present in the weeks logged.</p>`}
          ${
            !!st?.unverified &&
            html`<p class="text-dim text-small">
              <span class="star">*</span> ${plural(st.unverified, "day")} not verified against the timesheet.
            </p>`
          }`,
      );
    }),
  );

  const onChange = () =>
    batch(() => {
      ui.monthSel = select.value;
      ui.yearSel = null;
    });

  select.addEventListener("change", onChange);
  group.add(() => select.removeEventListener("change", onChange));

  return () => group.dispose();
}
