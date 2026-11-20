/** Banners: days ready to check against the timesheet, and backup reminder. */
import { effect } from "lume-js";
import { BACKUP_REMINDER_DAYS } from "../../domain/constants.js";
import { daysSince, formatDay, plural } from "../../lib/format.js";
import { model } from "../../state/model.js";
import { data } from "../../state/store.js";
import { byId, html, render } from "../dom.js";

export function mountAlerts() {
  const root = byId("alerts");
  return effect(() => {
    const { toVerify, coverage, laterUnverified } = model;
    const { lastExportAt, days } = data;
    const needsBackup = days.length > 0 && (!lastExportAt || daysSince(lastExportAt) >= BACKUP_REMINDER_DAYS);

    render(
      root,
      html`${
        toVerify.length > 0 &&
        html`<div class="banner">
          <div>
            <p class="banner__title">${plural(toVerify.length, "day")} to check</p>
            <p class="text-dim text-small">
              The timesheet covers through ${formatDay(coverage, { year: false })}.
              ${laterUnverified > 0 && `${plural(laterUnverified, "newer day")} ${laterUnverified === 1 ? "waits" : "wait"} for the next one.`}
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
