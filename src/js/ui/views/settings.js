/** Settings tab: theme, target, grouping, rounding, company holidays, rounding check, backup, help. */
import { bindDom, effect, state } from "lume-js";
import { createCleanupGroup } from "lume-js/addons";
import { show } from "lume-js/handlers";
import { backupFileName } from "../../domain/backup.js";
import { holidayDateOf, holidaysIn } from "../../domain/holidays.js";
import { addDays, isDateKey } from "../../domain/dates.js";
import { isBlankDay } from "../../domain/days.js";
import { STEP_MINUTES } from "../../domain/constants.js";
import { PRESET_GRACE, graceOf, roundTime } from "../../domain/rounding.js";
import { roundingCheck } from "../../domain/verification.js";
import { formatDay, formatShortDate, formatTime, monthShort, plural, weekdayShort } from "../../lib/format.js";
import {
  backupJson,
  data,
  eraseEverything,
  flush,
  importBackup,
  markExported,
  addHoliday,
  copyHolidaysToYear,
  deleteDay,
  updateHoliday,
  toast,
  ui,
  updateSettings,
} from "../../state/store.js";
import { APP_VERSION } from "../../version.js";
import { registerActions } from "../actions.js";

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

export function mountSettings() {
  const group = createCleanupGroup();
  const page = byId("tab-settings");
  const target = byId("target-input", HTMLInputElement);
  const importInput = byId("import-file", HTMLInputElement);

  const view = state({
    holidaySummary: "",
    holidayTitle: "Company holidays",
    holidayRev: 0,
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
      const { lastExportAt, days, storage, persist } = data;
      const holidays = days.filter((d) => d.status === "holiday");
      const exported = lastExportAt ? `Last export ${formatShortDate(lastExportAt)}.` : "Never exported.";

      view.backupInfo = `${plural(days.length, "day")} and ${plural(holidays.length, "holiday")} on this device. ${exported} Import: the file wins. Its days replace the same dates here; other days are kept.`;

      const where =
        storage === "localstorage" ? "localStorage (IndexedDB unavailable)" : storage === "failed" ? "nowhere: saving failed" : "IndexedDB";

      const kept =
        persist === "granted"
          ? "persistent (protected from automatic cleanup)"
          : "best-effort (the browser may clear it under storage pressure)";

      view.storageInfo = `Stored in ${where}, ${kept}. Deleting the Home Screen app or clearing website data erases it.`;
    }),
  );

  // ---- Company holidays ----
  // Holidays are Holiday day records: this editor adds, edits and deletes
  // them directly, so History (which reads only day records) never depends
  // on a separate list.
  const holidayList = byId("holiday-list");

  /** This year's holidays (by real date). Other years live in History. */
  const thisYear = () => ui.today.slice(0, 4);
  const yearHolidays = () => holidaysIn(data.days, thisYear());

  /**
   * Copy is offered only once a new year has started and it has no
   * holidays yet: last year's list, into this year. Never ahead of time,
   * so it can't be pressed by accident.
   * @returns {{ from: string, to: string } | null}
   */
  const copyOffer = () => {
    const to = ui.today.slice(0, 4);
    const from = String(Number(to) - 1);

    return holidaysIn(data.days, to).length === 0 && holidaysIn(data.days, from).length > 0 ? { from, to } : null;
  };

  /** @param {import("../../domain/types.js").Day} d */
  const holidayRow = (d) => {
    const real = holidayDateOf(d);
    const [, month, day] = real.split("-").map(Number);

    return html`<li class="holiday-row${d.date < ui.today ? " holiday-row--past" : ""}">
      <label class="holiday-row__tile">
        <span class="holiday-row__month">${monthShort(month - 1)}</span>
        <span class="holiday-row__date">${day}</span>
        <!-- Invisible native picker over the tile: tap it to change the date. -->
        <input
          class="holiday-row__picker"
          type="date"
          value="${real}"
          min="${thisYear()}-01-01"
          max="${thisYear()}-12-31"
          data-holiday-date="${d.date}"
          aria-label="Date of ${d.note ?? "holiday"}"
        />
      </label>
      <span class="holiday-row__body">
        <input
          class="holiday-row__name"
          type="text"
          value="${d.note ?? ""}"
          data-holiday-name="${d.date}"
          placeholder="Holiday name"
          autocomplete="off"
          aria-label="Holiday name"
        />
        <span class="holiday-row__meta">
          ${weekdayShort(real)}${d.observedFrom && html` · <span class="holiday-row__observed">observed ${formatDay(d.date, { year: false })}</span>`}
        </span>
      </span>
      <button
        type="button"
        class="holiday-row__delete"
        data-action="delete-holiday"
        data-date="${d.date}"
        aria-label="Delete ${d.note ?? real}"
      >
        ×
      </button>
    </li>`;
  };

  group.add(
    effect(() => {
      const { loaded } = data;

      view.holidayRev; // re-render after a rejected edit, to put the old value back

      if (!loaded) return;

      const list = yearHolidays();

      view.holidayTitle = `Company holidays · ${thisYear()}`;

      // Copy is offered inside the empty state, only when a new year starts.
      const offer = list.length ? null : copyOffer();

      render(
        holidayList,
        list.length
          ? html`${list.map(holidayRow)}`
          : html`<li class="holiday-list__empty">
              <p>No holidays for ${thisYear()} yet.</p>
              ${
                offer &&
                html`<button type="button" class="btn btn--fit btn--primary" data-action="copy-holidays">
                  Copy ${offer.from} holidays
                </button>`
              }
            </li>`,
      );

      const next = list.find((d) => d.date >= ui.today);

      view.holidaySummary = next
        ? `Next: ${next.note ?? "holiday"}, ${formatDay(next.date)}${next.observedFrom ? " (observed)" : ""}.`
        : "";
    }),
  );

  /** @param {Event} event */
  const onHolidayChange = (event) => {
    const el = event.target;

    if (!(el instanceof HTMLInputElement)) return;

    const { holidayDate, holidayName } = el.dataset;

    const error = holidayDate
      ? !isDateKey(el.value)
        ? "Pick a date."
        : !el.value.startsWith(`${thisYear()}-`)
          ? `Pick a date in ${thisYear()}.`
          : updateHoliday(holidayDate, { date: el.value })
      : holidayName
        ? updateHoliday(holidayName, { name: el.value })
        : null;

    if (error) {
      toast(error);
      view.holidayRev++;
    }
  };

  holidayList.addEventListener("change", onHolidayChange);
  group.add(() => holidayList.removeEventListener("change", onHolidayChange));

  /** First date from today, this year, with nothing logged. */
  const nextFreeDate = () => {
    const taken = new Set(data.days.filter((d) => !isBlankDay(d)).map((d) => d.date));
    let date = ui.today;

    while (taken.has(date) && date.startsWith(thisYear())) date = addDays(date, 1);

    return date.startsWith(thisYear()) ? date : null;
  };

  group.add(
    effect(() => {
      const value = String(data.settings.target);

      if (document.activeElement !== target) target.value = value;
    }),
  );

  const commitTarget = () => {
    const value = Number(target.value.trim());

    if (Number.isFinite(value) && value > 0 && value <= 24) {
      updateSettings({ target: value });
      toast(`Target set to ${value}h`);
    } else {
      target.value = String(data.settings.target);
    }
  };

  /** @param {KeyboardEvent} event */
  const blurOnEnter = (event) => {
    if (event.key === "Enter") target.blur();
  };

  target.addEventListener("change", commitTarget);
  target.addEventListener("keydown", blurOnEnter);

  group.add(() => {
    target.removeEventListener("change", commitTarget);
    target.removeEventListener("keydown", blurOnEnter);
  });

  async function exportBackup() {
    const name = backupFileName(new Date());
    const file = new File([backupJson()], name, { type: "application/json" });

    // The share sheet is the reliable way to "Save to Files" from an iOS
    // Home Screen app; elsewhere fall back to a normal download. Share the
    // file alone: a title or text is saved by iOS as an extra .txt file.
    if (navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file] });
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

      const parts = [
        `${result.added} new`,
        result.replaced && `${result.replaced} replaced`,
        result.holidays && `${plural(result.holidays, "holiday")} from the old list`,
        result.skipped && `${result.skipped} rows skipped`,
      ].filter(Boolean);

      toast(`Imported ${plural(result.added + result.replaced, "day")}: ${parts.join(", ")}`);
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
  page.addEventListener("change", onGraceChange);

  group.add(() => {
    importInput.removeEventListener("change", onImport);
    page.removeEventListener("change", onGraceChange);
  });

  registerActions({
    theme: (el) => {
      theme.pref = /** @type {ThemePref} */ (el.dataset.value);
    },
    grouping: (el) => updateSettings({ grouping: /** @type {Grouping} */ (el.dataset.value) }),
    roundIn: (el) => updateSettings({ roundIn: { ...data.settings.roundIn, mode: /** @type {RoundingMode} */ (el.dataset.value) } }),
    roundOut: (el) => updateSettings({ roundOut: { ...data.settings.roundOut, mode: /** @type {RoundingMode} */ (el.dataset.value) } }),
    "add-holiday": () => {
      const date = nextFreeDate();

      if (!date) {
        toast(`No free dates left in ${thisYear()}.`);

        return;
      }

      const { error, observed } = addHoliday(date, "");

      if (error || !observed) {
        toast(error ?? "Couldn't add the holiday.");

        return;
      }

      // Focus the new row's name once it has rendered.
      setTimeout(() => {
        const input = holidayList.querySelector(`[data-holiday-name="${observed}"]`);

        if (input instanceof HTMLInputElement) input.focus();
      }, 0);
    },
    "delete-holiday": (el) => {
      if (!el.dataset.date) return;

      deleteDay(el.dataset.date);
      toast("Holiday removed");
    },
    "copy-holidays": () => {
      const offer = copyOffer();

      if (!offer) return;

      const added = copyHolidaysToYear(offer.from, offer.to);

      toast(added ? `Copied ${plural(added, "holiday")} to ${offer.to}. Adjust any dates that move.` : `Nothing to copy.`);
    },
    export: exportBackup,
    import: () => importInput.click(),
    erase: async () => {
      if (!window.confirm("Erase every day, holiday and setting on this device? Export a backup first if you might need it.")) return;
      if (!window.confirm("This cannot be undone. Erase everything?")) return;

      await eraseEverything();
      toast("All data erased");
    },
  });

  group.add(bindDom(page, view, { handlers: [show] }));

  return () => group.dispose();
}
