/** Home banners: forgotten clock-out, days to check, backup reminder. */
import { effect } from "lume-js";
import { BACKUP_REMINDER_DAYS } from "../../domain/constants.js";
import { daysSince, formatDay, formatTime, plural } from "../../lib/format.js";
import { model } from "../../state/model.js";
import { data } from "../../state/store.js";
import { registerActions } from "../actions.js";
import { byId, html, render } from "../dom.js";
import { openPunchDialog } from "./punch-dialog.js";

export function mountAlerts() {
  const root = byId("alerts");

  registerActions({ "fix-stale-shift": () => openPunchDialog("out") });

  return effect(() => {
    const { toVerify, coverage, laterUnverified, staleShift, openDay } = model;
    const { lastExportAt, days } = data;
    const needsBackup = days.length > 0 && (!lastExportAt || daysSince(lastExportAt) >= BACKUP_REMINDER_DAYS);

    render(
      root,
      html`${
        staleShift &&
        openDay &&
        html`<div class="banner banner--warn">
          <div>
            <p class="banner__title">Forgot to clock out?</p>
            <p class="text-dim text-small">
              Clocked in ${formatDay(openDay.date, { year: false })} at ${formatTime(openDay.recorded?.start)}. Set when you left.
            </p>
          </div>
          <button type="button" class="btn btn--pill btn--primary" data-action="fix-stale-shift">Set time</button>
        </div>`
      }
      ${
        toVerify.length > 0 &&
        html`<div class="banner">
          <div>
            <p class="banner__title">${plural(toVerify.length, "day")} to check</p>
            <p class="text-dim text-small">
              Timesheet is out through
              ${formatDay(coverage, { year: false })}.${laterUnverified > 0 && ` ${plural(laterUnverified, "newer day")} later.`}
            </p>
          </div>
          <button type="button" class="btn btn--pill" data-action="open-verify">Review</button>
        </div>`
      }
      ${
        needsBackup &&
        html`<div class="banner banner--muted">
          <div>
            <p class="banner__title">${lastExportAt ? `Last backup ${daysSince(lastExportAt)} days ago` : "No backup yet"}</p>
            <p class="text-dim text-small">Data lives only on this device.</p>
          </div>
          <button type="button" class="btn btn--pill" data-action="export">Export</button>
        </div>`
      }`,
    );
  });
}
