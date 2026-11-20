/** Settings sheet: theme, grouping, rounding, holidays, rounding check, backup. */
import { batch, bindDom, effect, state } from "lume-js";
import { createCleanupGroup } from "lume-js/addons";
import { holidaysToText, parseHolidays } from "../../domain/backup.js";
import { STEP_MINUTES } from "../../domain/constants.js";
import { PRESET_GRACE, graceOf, roundTime } from "../../domain/rounding.js";
import { roundingCheck } from "../../domain/verification.js";
import { formatDay, formatShortDate, formatTime, plural } from "../../lib/format.js";
import {
  backupJson,
  data,
  eraseEverything,
  flush,
  importBackup,
  markExported,
  setHolidays,
  toast,
  ui,
  updateSettings,
} from "../../state/store.js";
import { APP_VERSION } from "../../version.js";
import { registerActions } from "../actions.js";
import { closeDialogs, openDialog } from "../dialogs.js";
import { byId, html, render, segmentButtons } from "../dom.js";
import { theme } from "../theme.js";

/** @import { Grouping, RoundingMode, RoundingRule } from "../../domain/types.js" */
/** @import { GraceFit } from "../../domain/verification.js" */
/** @import { ThemePref } from "../theme.js" */

const THEME_OPTIONS = /** @type {const} */ ([
  ["system", "System"],
  ["light", "Light"],
  ["dark", "Dark"],
]);

const GROUPING_OPTIONS = /** @type {const} */ ([
  ["tracking", "Tracking month"],
  ["calendar", "Calendar month"],
]);

const RULE_OPTIONS = /** @type {const} */ ([
  ["down", "Down"],
  ["up", "Up"],
  ["nearest", "Nearest"],
  ["custom", "Custom"],
  ["none", "None"],
]);

const EXAMPLES = { roundIn: ["09:01", "09:05", "09:12"], roundOut: ["16:16", "16:19", "16:20"] };

/**
 * @param {"roundIn" | "roundOut"} side
 * @param {RoundingRule} rule
 */
function ruleBlock(side, rule) {
  const label = side === "roundIn" ? "Clock-in" : "Clock-out";
  const grace = graceOf(rule);

  return html`<p class="field__label">${label}</p>
    <div class="seg seg--full" role="group" aria-label="${label} rounding">${segmentButtons(RULE_OPTIONS, rule.mode, side)}</div>
    ${
      rule.mode === "custom" &&
      html`<div class="cluster settings__grace">
        <label class="text-dim text-small" for="grace-${side}">Grace</label>
        <select id="grace-${side}" class="select" data-grace="${side}">
          ${Array.from({ length: STEP_MINUTES }, (_, i) => html`<option value="${i}" ${i === grace ? "selected" : ""}>${i} min</option>`)}
        </select>
      </div>`
    }
    <p class="field__hint tabular">${EXAMPLES[side].map((t) => `${formatTime(t)} → ${formatTime(roundTime(t, rule))}`).join(" · ")}</p>`;
}

/** @param {GraceFit} fit */
function presetsWithin(fit) {
  return Object.entries(PRESET_GRACE)
    .filter(([, g]) => g >= fit.lo && g <= fit.hi)
    .map(([mode]) => mode[0].toUpperCase() + mode.slice(1));
}

/**
 * @param {GraceFit | null} fit
 * @param {string} side
 */
function fitLine(fit, side) {
  if (!fit) return "";
  if (!fit.ok) return html`<li>${side}: no single grace fits; the verified days disagree. See the mismatches below.</li>`;

  const presets = presetsWithin(fit);
  const range = fit.lo === fit.hi ? `${fit.lo} min` : `${fit.lo}–${fit.hi} min`;

  return html`<li>
    ${side}: ${presets.length ? html`<strong>${presets.join(" or ")}</strong> fits` : "fits"} all ${plural(fit.used, "verified day")} (any
    grace of <strong>${range}</strong>)${fit.odd > 0 && `; ${fit.odd} off the quarter-hour grid`}.
  </li>`;
}

export function mountSettingsDialog() {
  const group = createCleanupGroup();
  const dialog = byId("settings-dialog", HTMLDialogElement);
  const importInput = byId("import-file", HTMLInputElement);

  const view = state({
    holidayText: "",
    holidayMessage: "",
    backupInfo: "",
    storageInfo: "",
    versionInfo: `RTO ${APP_VERSION}`,
  });

  group.add(
    effect(() => {
      render(byId("s-theme"), html`${segmentButtons(THEME_OPTIONS, theme.pref, "theme")}`);
    }),
  );

  group.add(
    effect(() => {
      const { grouping, roundIn, roundOut } = data.settings;

      render(byId("s-grouping"), html`${segmentButtons(GROUPING_OPTIONS, grouping, "grouping")}`);
      render(byId("s-round-in"), ruleBlock("roundIn", roundIn));
      render(byId("s-round-out"), ruleBlock("roundOut", roundOut));
    }),
  );

  group.add(
    effect(() => {
      const report = roundingCheck(data.days, data.settings);
      const el = byId("s-check");

      if (!report.in.total) {
        render(
          el,
          html`<p class="field__hint">
            Once you verify days that also have your own punches, this shows how often the rounding rules predicted the timesheet, and which
            grace fits.
          </p>`,
        );

        return;
      }

      const recent = report.mismatches.slice(-30).reverse();

      render(
        el,
        html`<p class="text-small">
            Clock-in matched <strong>${report.in.match}/${report.in.total}</strong> · clock-out matched
            <strong>${report.out.match}/${report.out.total}</strong> with the current rules.
          </p>
          <ul class="field__hint settings__list">
            ${fitLine(report.fit.in, "Clock-in")} ${fitLine(report.fit.out, "Clock-out")}
          </ul>
          ${
            recent.length > 0 &&
            html`<details class="settings__details">
              <summary class="text-small">${plural(report.mismatches.length, "mismatch", "mismatches")}</summary>
              <ul class="field__hint settings__list">
                ${recent.map(
                  (m) =>
                    html`<li>
                      <strong>${formatDay(m.date, { year: false })}</strong>: punched ${formatTime(m.recorded.start)} →
                      ${formatTime(m.recorded.end)}, predicted ${formatTime(m.predicted.start)} → ${formatTime(m.predicted.end)}, timesheet
                      ${formatTime(m.actual.start)} → ${formatTime(m.actual.end)}
                    </li>`,
                )}
              </ul>
            </details>`
          }`,
      );
    }),
  );

  group.add(
    effect(() => {
      const { lastExportAt, days, holidays, storage, persist } = data;
      const exported = lastExportAt ? `Last export ${formatShortDate(lastExportAt)}.` : "Never exported.";

      view.backupInfo = `${plural(days.length, "day")} and ${plural(holidays.length, "holiday")} on this device. ${exported} Import merges by date: a day in the file replaces the same day here.`;

      const where =
        storage === "localstorage" ? "localStorage (IndexedDB unavailable)" : storage === "failed" ? "nowhere: saving failed" : "IndexedDB";

      const kept =
        persist === "granted"
          ? "persistent (protected from automatic cleanup)"
          : "best-effort (the browser may clear it under storage pressure)";

      view.storageInfo = `Stored in ${where}, ${kept}. Deleting the Home Screen app or clearing website data erases it.`;
    }),
  );

  async function exportBackup() {
    const name = `rto-backup-${ui.today}.json`;
    const file = new File([backupJson()], name, { type: "application/json" });

    // The share sheet is the reliable way to "Save to Files" from an iOS
    // Home Screen app; elsewhere fall back to a normal download.
    if (navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: name });
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;

        toast("Could not share the file.");

        return;
      }
    } else {
      const url = URL.createObjectURL(file);
      const link = Object.assign(document.createElement("a"), { href: url, download: name });

      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    markExported();
    toast("Backup exported");
  }

  const onImport = async () => {
    const file = importInput.files?.[0];

    importInput.value = "";

    if (!file) return;

    try {
      const result = importBackup(await file.text());

      await flush();
      view.holidayText = holidaysToText(data.holidays);

      const extras = [result.holidays && plural(result.holidays, "holiday"), result.skipped && `${result.skipped} rows skipped`].filter(
        Boolean,
      );

      toast(`Imported ${plural(result.days, "day")}${extras.length ? ` (${extras.join(", ")})` : ""}`);
    } catch (error) {
      toast(error instanceof Error ? error.message : "Import failed.");
    }
  };

  /** @param {Event} event */
  const onGraceChange = (event) => {
    const el = event.target;

    if (!(el instanceof HTMLSelectElement) || !el.dataset.grace) return;

    const side = /** @type {"roundIn" | "roundOut"} */ (el.dataset.grace);

    updateSettings({ [side]: { mode: "custom", grace: Number(el.value) } });
  };

  importInput.addEventListener("change", onImport);
  dialog.addEventListener("change", onGraceChange);

  group.add(() => {
    importInput.removeEventListener("change", onImport);
    dialog.removeEventListener("change", onGraceChange);
  });

  registerActions({
    "open-settings": () => {
      batch(() => {
        view.holidayText = holidaysToText(data.holidays);
        view.holidayMessage = "";
      });

      openDialog(dialog);
    },
    theme: (el) => {
      theme.pref = /** @type {ThemePref} */ (el.dataset.value);
    },
    grouping: (el) => updateSettings({ grouping: /** @type {Grouping} */ (el.dataset.value) }),
    roundIn: (el) => updateSettings({ roundIn: { ...data.settings.roundIn, mode: /** @type {RoundingMode} */ (el.dataset.value) } }),
    roundOut: (el) => updateSettings({ roundOut: { ...data.settings.roundOut, mode: /** @type {RoundingMode} */ (el.dataset.value) } }),
    "save-holidays": () => {
      const { list, invalid } = parseHolidays(view.holidayText);

      setHolidays(list);
      view.holidayText = holidaysToText(list);
      view.holidayMessage = `Saved ${list.length}${invalid ? `; ${plural(invalid, "line")} not understood` : ""}.`;
    },
    export: exportBackup,
    import: () => importInput.click(),
    erase: async () => {
      if (!window.confirm("Erase every day, holiday and setting on this device? Export a backup first if you might need it.")) return;
      if (!window.confirm("This cannot be undone. Erase everything?")) return;

      await eraseEverything();
      closeDialogs();
      toast("All data erased");
    },
  });

  group.add(bindDom(dialog, view));

  return () => group.dispose();
}
