/** "Check against timesheet" sheet: confirm unverified days in bulk or one by one. */
import { effect } from "lume-js";
import { createCleanupGroup } from "lume-js/addons";
import { STATUS_LABEL } from "../../domain/constants.js";
import { predictEntry, resolveDay } from "../../domain/days.js";
import { isTime } from "../../domain/time.js";
import { formatDay, formatHours, formatTime, plural } from "../../lib/format.js";
import { model } from "../../state/model.js";
import { data, verifyAsPredicted } from "../../state/store.js";
import { registerActions } from "../actions.js";
import { closeDialogs, openDialog } from "../dialogs.js";
import { byId, html, render } from "../dom.js";

/** @import { Day, Settings } from "../../domain/types.js" */

/**
 * @param {Day} day
 * @param {Settings} settings
 */
function summary(day, settings) {
  const r = resolveDay(day, settings);
  const rec = day.recorded;

  if (day.status !== "office") return html`${STATUS_LABEL[day.status]}${r.pto !== null && ` · PTO ${formatHours(r.pto)}`}`;

  if (rec && isTime(rec.start) && isTime(rec.end)) {
    const p = predictEntry(rec, settings);

    return html`${formatTime(p?.start)} → ${formatTime(p?.end)} · <strong>${formatHours(p?.hours)}</strong><br />
      <span class="text-dim text-small">you: ${formatTime(rec.start)} → ${formatTime(rec.end)}</span>`;
  }

  return html`${r.total === null ? "No hours" : formatHours(r.total)}`;
}

export function mountVerifyDialog() {
  const group = createCleanupGroup();
  const dialog = byId("verify-dialog", HTMLDialogElement);
  const body = byId("verify-body");

  group.add(
    effect(() => {
      const { toVerify, coverage, laterUnverified } = model;
      const { settings } = data;

      if (!coverage) return;

      const through = formatDay(coverage, { year: false });

      const later =
        laterUnverified > 0 &&
        ` ${plural(laterUnverified, "newer day")} ${laterUnverified === 1 ? "is" : "are"} waiting for the next timesheet.`;

      if (!toVerify.length) {
        render(body, html`<p class="text-dim">Nothing to check. Days through ${through} are verified.${later}</p>`);

        return;
      }

      render(
        body,
        html`<p class="field__hint">
            Timesheet through <strong>${through}</strong>. Tap <strong>Matches</strong> when it shows the predicted values, or
            <strong>Edit</strong> to type what it really says. Differences feed the rounding check in Settings.
          </p>
          <ul class="verify-list">
            ${toVerify.map(
              (day) =>
                html`<li class="verify-list__row">
                  <div class="verify-list__info">
                    <strong>${formatDay(day.date, { year: false })}</strong>
                    <p class="text-small">${summary(day, settings)}</p>
                  </div>
                  <div class="cluster">
                    <button type="button" class="btn btn--pill btn--small" data-action="edit-day" data-date="${day.date}">Edit</button>
                    <button type="button" class="btn btn--pill btn--small btn--primary" data-action="verify-day" data-date="${day.date}">
                      Matches
                    </button>
                  </div>
                </li>`,
            )}
          </ul>
          <button type="button" class="btn btn--primary btn--block" data-action="verify-all">
            All ${toVerify.length} match the timesheet
          </button>`,
      );
    }),
  );

  registerActions({
    "open-verify": () => openDialog(dialog),
    "verify-all": () => {
      verifyAsPredicted(model.toVerify.map((d) => d.date));
      closeDialogs();
    },
  });

  return () => group.dispose();
}
