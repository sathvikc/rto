/**
 * Home, top: date, live clock, punch button, "set time" link, leave-by
 * plan and today's day type.
 */
/** @import { DayStatus } from "../../domain/types.js" */
import { bindDom, effect, state } from "lume-js";
import { createCleanupGroup } from "lume-js/addons";
import { classToggle, show } from "lume-js/handlers";
import { STATUS_LABEL } from "../../domain/constants.js";
import { isWeekday, toDateKey } from "../../domain/dates.js";
import { resolveDay } from "../../domain/days.js";
import { leavePlan } from "../../domain/shift.js";
import { toMinutes } from "../../domain/time.js";
import { formatClock, formatDay, formatHours, formatLongDate, formatTime } from "../../lib/format.js";
import { model } from "../../state/model.js";
import { clockIn, clockOut, data, flush, setTodayStatus, toast, ui } from "../../state/store.js";
import { registerActions } from "../actions.js";
import { byId, html, render, trusted } from "../dom.js";
import { openPunchDialog } from "./punch-dialog.js";

const QUICK_STATUSES = /** @type {const} */ (["wfh", "ooo", "sick"]);

/** After this time on a weekday, an empty day prompts "Arrived earlier?". */
const LATE_PROMPT_MINUTES = 10 * 60;

/** @param {Date} d */
const minutesOf = (d) => d.getHours() * 60 + d.getMinutes();

export function mountNow() {
  const group = createCleanupGroup();

  const view = state({
    dateLine: "",
    clockText: "",
    secondsText: "",
    statusLine: "",
    detailLine: "",
    detailStatic: true,
    punchLabel: "Clock in",
    punchAtLabel: "",
    isOpen: false,
    punchDisabled: true,
  });

  // Markup (from our own html templates) that changes at most once a
  // minute; Lume skips identical string writes, so the DOM is left alone.
  const plan = state({ markup: "", quick: "" });

  // Every second: the clock, and elapsed time while on the clock.
  group.add(
    effect(() => {
      const now = new Date(ui.nowMs);
      const open = model.openDay;

      view.dateLine = formatLongDate(now);
      view.clockText = formatClock(now);
      view.secondsText = String(now.getSeconds()).padStart(2, "0");

      if (open?.recorded?.start && !model.staleShift) {
        const overnight = open.date === toDateKey(now) ? 0 : 1440;
        const elapsed = Math.max(0, (minutesOf(now) + now.getSeconds() / 60 + overnight - toMinutes(open.recorded.start)) / 60);

        view.detailLine = `Started ${formatTime(open.recorded.start)} · ${formatHours(elapsed, 1)} so far ✎`;
      }
    }),
  );

  // When the day's records change.
  group.add(
    effect(() => {
      const { openDay, todayDay, todayHoliday, staleShift } = model;
      const { settings, loaded } = data;

      view.isOpen = openDay !== null;
      view.punchLabel = openDay ? "Clock out" : "Clock in";
      view.punchDisabled = !loaded;
      view.punchAtLabel = openDay ? "Left earlier? Set the time" : todayDay?.recorded?.start ? "" : "Got in earlier? Set the time";
      view.detailStatic = true;

      if (openDay && staleShift) {
        view.statusLine = "Still clocked in";
        view.detailLine = `Since ${formatDay(openDay.date, { year: false })}, ${formatTime(openDay.recorded?.start)}`;
        view.punchAtLabel = "";

        return;
      }

      if (openDay) {
        view.statusLine = "On the clock";
        view.detailStatic = false;

        return; // The ticking effect fills in the detail line.
      }

      if (todayDay && todayDay.status !== "office") {
        view.statusLine = `Today: ${STATUS_LABEL[todayDay.status]}`;
        view.detailLine = "Not an office day";
      } else if (todayDay?.recorded?.start && todayDay.recorded.end) {
        const r = resolveDay(todayDay, settings);

        view.statusLine = "Done for today";
        view.detailLine = `${formatTime(todayDay.recorded.start)} → ${formatTime(todayDay.recorded.end)} · ${formatHours(r.work)}${r.verified ? "" : " *"} ✎`;
        view.detailStatic = false;
      } else {
        view.statusLine = "Off the clock";
        view.detailLine = todayHoliday ? `Company holiday${todayHoliday.name ? `: ${todayHoliday.name}` : ""}` : "Not clocked in";
      }
    }),
  );

  // Leave-by plan while on the clock (minute resolution).
  group.add(
    effect(() => {
      const now = new Date(ui.nowMs);
      const { openDay, staleShift, needed } = model;
      const { settings } = data;
      const start = openDay?.recorded?.start;

      if (!start || staleShift) {
        plan.markup = "";

        return;
      }

      const overnight = openDay.date === toDateKey(now) ? 0 : 1440;
      const p = leavePlan(start, minutesOf(now) + overnight, settings, needed ?? settings.target);

      if (!p) {
        plan.markup = "";

        return;
      }

      const showNext = p.next && p.next.out !== p.now.out && (!p.goal || p.next.at !== p.goal.at);

      plan.markup = html`<p class="leave-plan__head">If you leave… <span>timesheet out · hours</span></p>
        <p class="leave-plan__row">
          <span class="text-dim">Now</span>
          <span>${formatTime(p.now.out)} · <strong>${formatHours(p.now.hours)}</strong></span>
        </p>
        ${
          showNext &&
          p.next &&
          html`<p class="leave-plan__row">
            <span class="text-dim">At ${formatTime(p.next.at)}+</span>
            <span>${formatTime(p.next.out)} · <strong>${formatHours(p.next.hours)}</strong></span>
          </p>`
        }
        ${
          p.goal &&
          html`<p class="leave-plan__row leave-plan__row--goal">
            <span>At ${formatTime(p.goal.at)}+ for ${formatHours(needed ?? settings.target, 1)} pace</span>
            <span>${formatTime(p.goal.out)} · <strong>${formatHours(p.goal.hours)}</strong></span>
          </p>`
        }`.value;
    }),
  );

  // Quick day type, or the late "arrived earlier?" prompt.
  group.add(
    effect(() => {
      const now = new Date(ui.nowMs);
      const { openDay, todayDay, todayHoliday } = model;

      if (openDay || todayDay?.recorded?.start || todayDay?.actual) {
        plan.quick = "";

        return;
      }

      if (todayDay && todayDay.status !== "office") {
        plan.quick = html`<span class="text-dim text-small">Marked ${STATUS_LABEL[todayDay.status]} today.</span>
          <button type="button" class="link-btn" data-action="today-status" data-value="office">Undo</button>`.value;

        return;
      }

      const late = isWeekday(ui.today) && !todayHoliday && minutesOf(now) >= LATE_PROMPT_MINUTES;

      plan.quick = html`<span class="text-dim text-small">${late ? "Not clocked in yet." : "Not in the office today?"}</span>
        <span class="cluster">
          ${QUICK_STATUSES.map((s) => html`<button type="button" class="chip" data-action="today-status" data-value="${s}">${STATUS_LABEL[s]}</button>`)}
        </span>`.value;
    }),
  );

  const planEl = byId("leave-plan");
  const quickEl = byId("today-status");

  group.add(
    effect(() => {
      render(planEl, trusted(plan.markup));
      planEl.hidden = !plan.markup;
    }),
  );

  group.add(
    effect(() => {
      render(quickEl, trusted(plan.quick));
    }),
  );

  registerActions({
    punch: () => {
      // A forgotten clock-out must not become a 20-hour shift.
      if (model.staleShift) {
        openPunchDialog("out");

        return;
      }

      const error = model.openDay ? clockOut() : clockIn();

      if (error) toast(error);
      else void flush();
    },
    "punch-at": () => openPunchDialog(model.openDay ? "out" : "in"),
    "edit-punch-time": () => openPunchDialog(model.openDay ? "start" : "end"),
    "today-status": (el) => setTodayStatus(/** @type {DayStatus} */ (el.dataset.value)),
  });

  group.add(bindDom(byId("tab-home"), view, { handlers: [classToggle("punch--out"), show] }));

  return () => group.dispose();
}
