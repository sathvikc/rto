/**
 * One-field sheet for punch times: clock in at, clock out at, or correct
 * today's clock-in / clock-out. Opened from Home, the stale-shift alert
 * and the toast's "Adjust".
 */
import { bindDom, effect, state } from "lume-js";
import { createCleanupGroup } from "lume-js/addons";
import { toDateKey } from "../../domain/dates.js";
import { roundTime } from "../../domain/rounding.js";
import { fromMinutes, isTime, spanHours, timeOf, toMinutes } from "../../domain/time.js";
import { formatDay, formatHours, formatTime } from "../../lib/format.js";
import { model } from "../../state/model.js";
import { clockIn, clockOut, data, findDay, flush, setEndTime, setStartTime } from "../../state/store.js";
import { registerActions } from "../actions.js";
import { closeDialogs, openDialog } from "../dialogs.js";
import { byId, html, render } from "../dom.js";

/**
 * in    - clock in today at a chosen time
 * out   - clock out of the open shift at a chosen time
 * start - change the clock-in of the open (or today's) shift
 * end   - change today's clock-out
 * @typedef {"in" | "out" | "start" | "end"} PunchMode
 */

const NUDGES = [-15, -5, 5, 15];

/** @type {(mode: PunchMode) => void} */
let open = () => {};

/** @param {PunchMode} mode */
export const openPunchDialog = (mode) => open(mode);

export function mountPunchDialog() {
  const group = createCleanupGroup();
  const dialog = byId("punch-dialog", HTMLDialogElement);
  const formEl = byId("punch-form", HTMLFormElement);
  const nudges = byId("p-nudges");

  const form = state({
    mode: /** @type {PunchMode} */ ("in"),
    title: "",
    context: "",
    label: "",
    time: "",
    preview: "",
    error: "",
  });

  render(
    nudges,
    html`${NUDGES.map(
        (n) =>
          html`<button type="button" class="chip" data-action="punch-nudge" data-value="${n}">${n > 0 ? `+${n}` : `−${-n}`} min</button>`,
      )} <button type="button" class="chip" data-action="punch-now">Now</button>`,
  );

  // Preview what the timesheet will show for the chosen time.
  group.add(
    effect(() => {
      const { mode, time } = form;
      const { settings } = data;
      const shift = model.openDay ?? model.todayDay;
      const start = mode === "in" || mode === "start" ? time : shift?.recorded?.start;
      const end = mode === "out" || mode === "end" ? time : (shift?.recorded?.end ?? null);

      if (!isTime(time)) {
        form.preview = "";

        return;
      }

      const side = mode === "in" || mode === "start" ? settings.roundIn : settings.roundOut;
      const rounded = `Timesheet: ${formatTime(roundTime(time, side))}`;

      if (isTime(start) && isTime(end)) {
        const hours = spanHours(roundTime(start, settings.roundIn), roundTime(end, settings.roundOut));

        form.preview = `${rounded} · ${formatHours(hours)} for the day`;
      } else {
        form.preview = rounded;
      }
    }),
  );

  open = (mode) => {
    const shift = mode === "end" ? findDay(toDateKey(new Date())) : (model.openDay ?? findDay(toDateKey(new Date())));
    const now = timeOf(new Date());
    const startTime = shift?.recorded?.start ?? null;
    const isOtherDay = shift && shift.date !== toDateKey(new Date());

    /** @type {Record<PunchMode, { title: string, label: string, time: string }>} */
    const copy = {
      in: { title: "Clock in at…", label: "Arrived at", time: model.usual?.start && now > model.usual.start ? model.usual.start : now },
      out: { title: "Clock out at…", label: "Left at", time: isOtherDay ? (model.usual?.end ?? "17:00") : now },
      start: { title: "Change clock-in", label: "Arrived at", time: startTime ?? now },
      end: { title: "Change clock-out", label: "Left at", time: shift?.recorded?.end ?? now },
    };

    Object.assign(form, {
      mode,
      ...copy[mode],
      context:
        mode === "in"
          ? "Forgot to clock in? Set when you arrived; clock out as usual later."
          : isOtherDay && shift
            ? `Your shift from ${formatDay(shift.date, { year: false })} is still open (in at ${formatTime(startTime)}). When did you leave?`
            : startTime
              ? `Clocked in at ${formatTime(startTime)}.`
              : "",
      error: "",
    });

    openDialog(dialog);
  };

  function save() {
    const time = form.time;

    if (!isTime(time)) {
      form.error = "Pick a time.";

      return;
    }

    const actions = { in: clockIn, out: clockOut, start: setStartTime, end: setEndTime };
    const error = actions[form.mode](time);

    if (error) {
      form.error = error;

      return;
    }

    void flush();
    closeDialogs();
  }

  /** @param {SubmitEvent} event */
  const onSubmit = (event) => {
    event.preventDefault();
    save();
  };

  /** @param {Event} event */
  const onChange = (event) => {
    if (event.target instanceof HTMLInputElement) form.time = event.target.value;
  };

  formEl.addEventListener("submit", onSubmit);
  formEl.addEventListener("change", onChange);

  group.add(() => {
    formEl.removeEventListener("submit", onSubmit);
    formEl.removeEventListener("change", onChange);
  });

  registerActions({
    "punch-nudge": (el) => {
      const base = isTime(form.time) ? toMinutes(form.time) : toMinutes(timeOf(new Date()));

      form.time = fromMinutes(base + Number(el.dataset.value));
    },
    "punch-now": () => {
      form.time = timeOf(new Date());
    },
  });

  group.add(bindDom(dialog, form));

  return () => group.dispose();
}
