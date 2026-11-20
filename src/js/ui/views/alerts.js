/** Home banners: forgotten clock-out, days to check, backup reminder. */
import { effect } from "lume-js";
import { BACKUP_REMINDER_DAYS } from "../../domain/constants.js";
import { daysSince, formatDay, formatTime, plural } from "../../lib/format.js";
import { model } from "../../state/model.js";
import { data } from "../../state/store.js";
import { registerActions } from "../actions.js";
import { banner } from "../components/banner.js";
import { actionButton } from "../components/button.js";
import { byId, html, render } from "../dom.js";
import { openPunchDialog } from "./punch-dialog.js";

const PILL = "btn btn--pill";

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
        banner({
          tone: "warn",
          title: "Forgot to clock out?",
          text: `Clocked in ${formatDay(openDay.date, { year: false })} at ${formatTime(openDay.recorded?.start)}. Set when you left.`,
          action: actionButton("Set time", "fix-stale-shift", { className: `${PILL} btn--primary` }),
        })
      }
      ${
        toVerify.length > 0 &&
        banner({
          title: `${plural(toVerify.length, "day")} to check`,
          text: `Timesheet is out through ${formatDay(coverage, { year: false })}.${laterUnverified > 0 ? ` ${plural(laterUnverified, "newer day")} later.` : ""}`,
          action: actionButton("Review", "open-verify", { className: PILL }),
        })
      }
      ${
        needsBackup &&
        banner({
          tone: "muted",
          title: lastExportAt ? `Last backup ${daysSince(lastExportAt)} days ago` : "No backup yet",
          text: "Data lives only on this device.",
          action: actionButton("Export", "export", { className: PILL }),
        })
      }`,
    );
  });
}
