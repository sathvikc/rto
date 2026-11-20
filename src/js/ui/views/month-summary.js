/** History tab: month picker and that month's summary. */
import { batch, effect } from "lume-js";
import { createCleanupGroup } from "lume-js/addons";
import { groupKey } from "../../domain/dates.js";
import { formatDay, formatHours, formatPercent, monthName, plural } from "../../lib/format.js";
import { model } from "../../state/model.js";
import { data, ui } from "../../state/store.js";
import { registerActions } from "../actions.js";
import { statGrid } from "../components/stat-grid.js";
import { segmentButtons } from "../components/segmented.js";
import { actionButton } from "../components/button.js";
import { selectOptions } from "../components/select-options.js";
import { starNote, unverifiedMark } from "../components/star.js";
import { byId, html, render } from "../dom.js";

export function mountMonthSummary() {
  const group = createCleanupGroup();
  const select = byId("month-select", HTMLSelectElement);
  const summary = byId("month-summary");
  const viewToggle = byId("data-view");

  registerActions({
    "data-view": (el) => {
      ui.verifiedOnly = el.dataset.value === "verified";
    },
  });

  group.add(
    effect(() => {
      const { monthKeys, selKey } = model;

      render(select, selectOptions(monthKeys.map((k) => /** @type {const} */ ([k, monthName(k)]))));
      select.value = selKey;
    }),
  );

  group.add(
    effect(() => {
      const { selStat: st, selStatOther: other, selKey, currentKey, coverage } = model;
      const verifiedOnly = ui.verifiedOnly;

      render(
        viewToggle,
        segmentButtons(
          [
            ["all", "All days"],
            ["verified", "Verified only"],
          ],
          verifiedOnly ? "verified" : "all",
          "data-view",
        ),
      );

      // In the dashboard view, covered days you haven't matched yet count as
      // absent: say so, since matching them is what makes the numbers agree.
      const pending = verifiedOnly ? model.toVerify.filter((d) => groupKey(d.date, data.settings.grouping) === selKey).length : 0;

      const pendingNote = pending
        ? html`<p class="caption">
            ${starNote(`${plural(pending, "day")} through ${formatDay(coverage, { year: false })} not matched yet; counted as absent here.`)}
            ${actionButton("Review", "open-verify", { className: "link-btn" })}
          </p>`
        : "";

      // The other view's numbers, so a mismatch with the timesheet stands out.
      const differs = other && st && (other.avg?.toFixed(1) !== st.avg?.toFixed(1) || other.presencePct !== st.presencePct);
      const otherLabel = verifiedOnly ? "All days" : `Verified through ${formatDay(coverage, { year: false })}`;

      const compare =
        differs && other
          ? html`<p class="compare">
              ${otherLabel}: <strong>${formatHours(other.avg, 1)}</strong> avg ·
              <strong>${formatPercent(other.presencePct)}</strong> presence
            </p>`
          : "";

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
        html`<p class="caption">
            ${selKey === currentKey ? "This month" : monthName(selKey)} · ${grouping}
            month${verifiedOnly ? ` · verified, through ${formatDay(coverage, { year: false })}` : ""}
          </p>
          <p class="figure">${formatHours(st?.avg, 1)}${!!st?.unverifiedAvg && unverifiedMark()}</p>
          <p class="caption">${verdict}</p>
          ${statGrid([
            { label: "Office days", value: st?.counted ?? 0 },
            { label: "Presence", value: formatPercent(st?.presencePct) },
            { label: "WFH", value: st?.wfh ?? 0 },
          ])}
          ${!!st?.denom && html`<p class="caption">${st.present} of ${st.denom} weekdays present in the weeks logged.</p>`}
          ${
            !!st?.unverified &&
            html`<p class="caption">${starNote(`${plural(st.unverified, "day")} not verified against the timesheet.`)}</p>`
          }
          ${pendingNote} ${compare}`,
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
