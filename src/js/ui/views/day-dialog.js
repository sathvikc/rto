/** Manual entry / edit sheet, and the delete confirmation. */
import { bindDom, effect, state } from "lume-js";
import { createCleanupGroup } from "lume-js/addons";
import { show } from "lume-js/handlers";
import { STATUSES, STATUS_LABEL } from "../../domain/constants.js";
import { isDateKey } from "../../domain/dates.js";
import { isOpen, predictEntry } from "../../domain/days.js";
import { round2, spanHours } from "../../domain/time.js";
import { formatDay, formatHours, formatTime } from "../../lib/format.js";
import { data, deleteDay, findDay, predictedTimesheet, saveDay, toast, ui } from "../../state/store.js";
import { registerActions } from "../actions.js";
import { closeDialogs, openDialog } from "../dialogs.js";
import { byId, html, render, segmentButtons } from "../dom.js";

/** @import { DayStatus, Entry } from "../../domain/types.js" */

/** @type {Readonly<Record<DayStatus, string>>} */
const STATUS_HINT = {
  office: "Counts toward presence and average hours.",
  wfh: "Presence 0. Not counted in average hours.",
  ooo: "Out of office: presence 1. Add PTO hours if any.",
  sick: "Sick day: presence 1. Add PTO hours if any.",
};

const STATUS_OPTIONS = STATUSES.map((s) => /** @type {const} */ ([s, STATUS_LABEL[s]]));

/** Thrown for a message to show under the form. */
class FormError extends Error {}

/**
 * Parse a number field: "" -> null, invalid -> FormError.
 * @param {string} value
 * @param {string} label
 */
function hoursField(value, label) {
  const text = value.trim();

  if (!text) return null;

  const n = Number(text);

  if (!Number.isFinite(n) || n < 0 || n > 24) throw new FormError(`${label} must be a number from 0 to 24.`);

  return n;
}

/** @param {number | null} n */
const numText = (n) => (n === null ? "" : String(n));

export function mountDayDialog() {
  const group = createCleanupGroup();
  const dialog = byId("day-dialog", HTMLDialogElement);
  const formEl = byId("day-form", HTMLFormElement);
  const statusEl = byId("f-status");
  const deleteDialog = byId("delete-dialog", HTMLDialogElement);
  const deleteText = byId("delete-text");

  const form = state({
    title: "",
    saveLabel: "Save",
    editOf: /** @type {string | null} */ (null),
    date: "",
    status: /** @type {DayStatus} */ ("office"),
    rStart: "",
    rEnd: "",
    rHours: "",
    rPto: "",
    verified: false,
    aStart: "",
    aEnd: "",
    aHours: "",
    aPto: "",
    note: "",
    error: "",
    // Derived, for data-show / data-disabled bindings:
    statusHint: "",
    showTimes: true,
    showPto: true,
    hoursLocked: false,
    canFill: false,
    preview: "",
  });

  group.add(
    effect(() => {
      const { status, rStart, rEnd, rHours, rPto } = form;
      const { settings } = data;

      render(statusEl, html`${segmentButtons(STATUS_OPTIONS, status, "day-status")}`);
      const office = status === "office";

      form.statusHint = STATUS_HINT[status];
      form.showTimes = office;
      form.showPto = status !== "wfh";
      form.hoursLocked = Boolean(rStart && rEnd);
      form.canFill = office ? Boolean((rStart && rEnd) || rHours.trim() || rPto.trim()) : Boolean(rPto.trim());

      if (office && rStart && rEnd) {
        const p = predictEntry({ start: rStart, end: rEnd, hours: null, pto: null }, settings);

        form.preview =
          p?.hours == null
            ? "Clock out must differ from clock in."
            : `Predicted timesheet: ${formatTime(p.start)} → ${formatTime(p.end)} · ${formatHours(p.hours)}`;
      } else if (office && rStart) {
        form.preview = "No clock-out yet: the day stays in progress.";
      } else {
        form.preview = "";
      }
    }),
  );

  /** @param {string | null} date  null = new entry for today */
  function open(date) {
    const day = date ? findDay(date) : null;
    const r = day?.recorded;
    const a = day?.actual;

    Object.assign(form, {
      title: day ? `Edit ${formatDay(day.date, { year: false })}` : "Manual entry",
      saveLabel: day ? "Save changes" : "Save day",
      editOf: day?.date ?? null,
      date: day?.date ?? ui.today,
      status: day?.status ?? "office",
      rStart: r?.start ?? "",
      rEnd: r?.end ?? "",
      rHours: numText(r?.hours ?? null),
      rPto: numText(r?.pto ?? null),
      verified: Boolean(a),
      aStart: a?.start ?? "",
      aEnd: a?.end ?? "",
      aHours: numText(a?.hours ?? null),
      aPto: numText(a?.pto ?? null),
      note: day?.note ?? "",
      error: "",
    });

    openDialog(dialog);
  }

  function fillPredicted() {
    const p = predictedTimesheet({
      start: form.rStart || null,
      end: form.rEnd || null,
      hours: hoursField(form.rHours, "Hours"),
      pto: hoursField(form.rPto, "PTO hours"),
    });

    Object.assign(form, { aStart: p.start ?? "", aEnd: p.end ?? "", aHours: numText(p.hours), aPto: numText(p.pto) });
  }

  /** @returns {{ recorded: Entry | null, actual: Entry | null }} */
  function readEntries() {
    const f = form;
    const office = f.status === "office";
    const rHours = hoursField(f.rHours, "Hours");
    const rPto = hoursField(f.rPto, "PTO hours");
    const aHours = hoursField(f.aHours, "Timesheet hours");
    const aPto = hoursField(f.aPto, "Timesheet PTO hours");

    /** @type {Entry | null} */
    let recorded = null;

    if (office) {
      if (f.rEnd && !f.rStart) throw new FormError("Add a clock-in time, or clear clock-out.");
      if (f.rStart && f.rStart === f.rEnd) throw new FormError("Clock out must differ from clock in.");

      const hasTimes = Boolean(f.rStart || f.rEnd);

      if (hasTimes || rHours !== null || rPto !== null) {
        recorded = { start: f.rStart || null, end: f.rEnd || null, hours: hasTimes ? null : rHours, pto: rPto };
      }
    } else if (rPto !== null) {
      recorded = { start: null, end: null, hours: null, pto: rPto };
    }

    /** @type {Entry | null} */
    let actual = null;

    if (f.verified) {
      if (office) {
        if (f.aEnd && !f.aStart) throw new FormError("Timesheet: add the in time, or clear the out time.");

        const span = spanHours(f.aStart || null, f.aEnd || null);

        actual = { start: f.aStart || null, end: f.aEnd || null, hours: aHours ?? (span === null ? null : round2(span)), pto: aPto };

        if (actual.hours === null && actual.pto === null)
          throw new FormError("Timesheet: enter in and out times, hours or PTO, or turn off Verified.");
      } else {
        actual = { start: null, end: null, hours: null, pto: f.status === "wfh" ? null : aPto };
      }
    }

    return { recorded, actual };
  }

  function save() {
    try {
      if (!isDateKey(form.date)) throw new FormError("Pick a date.");

      const { recorded, actual } = readEntries();

      if (recorded?.start && !recorded.end) {
        const other = data.days.find((d) => isOpen(d) && d.date !== form.date && d.date !== form.editOf);

        if (other) throw new FormError(`You are still clocked in on ${formatDay(other.date, { year: false })}. Clock out there first.`);
      }

      const moving = form.editOf !== null && form.editOf !== form.date;
      const isNewDate = form.date !== form.editOf;

      if (isNewDate && findDay(form.date) && !window.confirm(`${formatDay(form.date)} already has an entry. Replace it?`)) return;

      saveDay({ date: form.date, status: form.status, recorded, actual, note: form.note }, moving ? form.editOf : null);
      toast(form.editOf ? "Day updated" : "Day saved");
      closeDialogs();
    } catch (error) {
      if (!(error instanceof FormError)) throw error;

      form.error = error.message;
    }
  }

  /** @param {SubmitEvent} event */
  const onSubmit = (event) => {
    event.preventDefault();
    save();
  };

  // Some iOS pickers fire only "change"; mirror bound inputs on change too.
  /** @param {Event} event */
  const onChange = (event) => {
    const el = event.target;

    if (el instanceof HTMLInputElement && el.type !== "checkbox" && el.dataset.bind && el.dataset.bind in form) {
      /** @type {Record<string, unknown>} */ (form)[el.dataset.bind] = el.value;
    }
  };

  formEl.addEventListener("submit", onSubmit);
  formEl.addEventListener("change", onChange);

  group.add(() => {
    formEl.removeEventListener("submit", onSubmit);
    formEl.removeEventListener("change", onChange);
  });

  /** @type {string | null} */
  let pendingDelete = null;

  registerActions({
    "open-day-form": () => open(null),
    "edit-day": (el) => {
      closeDialogs();
      open(el.dataset.date ?? null);
    },
    "day-status": (el) => {
      form.status = /** @type {DayStatus} */ (el.dataset.value);
    },
    "fill-predicted": () => {
      try {
        fillPredicted();
      } catch (error) {
        if (error instanceof FormError) form.error = error.message;
        else throw error;
      }
    },
    "ask-delete": (el) => {
      pendingDelete = el.dataset.date ?? null;

      if (!pendingDelete) return;

      deleteText.textContent = `${formatDay(pendingDelete)} will be removed from this device.`;
      openDialog(deleteDialog);
    },
    "confirm-delete": () => {
      if (pendingDelete) deleteDay(pendingDelete);

      pendingDelete = null;
      closeDialogs();
      toast("Day deleted");
    },
  });

  group.add(bindDom(dialog, form, { handlers: [show] }));

  return () => group.dispose();
}
