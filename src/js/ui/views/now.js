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
import { leaveRows } from "../../domain/shift.js";
import { toMinutes } from "../../domain/time.js";
import { formatClock, formatDay, formatHours, formatLongDate, formatTime, plural } from "../../lib/format.js";
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

      if (todayHoliday) {
        view.statusLine = "Company holiday";
        view.detailLine = todayHoliday.note ?? "Enjoy the day off";
      } else if (todayDay && todayDay.status !== "office") {
        view.statusLine = `Today: ${STATUS_LABEL[todayDay.status]}`;
        view.detailLine = "Not an office day";
      } else if (todayDay?.recorded?.start && todayDay.recorded.end) {
        const r = resolveDay(todayDay, settings);

        view.statusLine = "Done for today";
        view.detailLine = `${formatTime(todayDay.recorded.start)} → ${formatTime(todayDay.recorded.end)} · ${formatHours(r.work)}${r.verified ? "" : " *"} ✎`;
        view.detailStatic = false;
      } else {
        view.statusLine = "Off the clock";
        view.detailLine = "Not clocked in";
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
      const stat = model.currentStat;

      // Other office days left this month, after today (left includes today).
      const restDays = Math.max(0, model.left - 1);
      const restHours = needed !== null && needed > 0 ? needed : settings.target;

      const { rows, next } = leaveRows(start, minutesOf(now) + overnight, settings, {
        stat,
        paceHours: needed,
        targetHours: settings.target,
        restDays,
      });

      if (!rows.length) {
        plan.markup = "";

        return;
      }

      const currentAvg = stat?.avg ?? null;

      /** @param {import("../../domain/shift.js").LeaveRow} row */
      const label = (row) =>
        row.kinds
          .map((k) =>
            k === "now" ? "Now" : k === "pace" ? `On pace (${formatHours(needed, 1)})` : `Full ${formatHours(settings.target)} day`,
          )
          .join(" · ");

      // Compare each projected month end with the target: on pace lands on
      // it (=), a shorter day below (▼), a longer one above (▲).
      const EPSILON = 0.005;

      /** @param {number} avg */
      const versusTarget = (avg) => (avg > settings.target + EPSILON ? 1 : avg < settings.target - EPSILON ? -1 : 0);

      const ARROW = { 1: "▲", 0: "=", [-1]: "▼" };
      const CLASS = { 1: "leave-table__avg--ok", 0: "leave-table__avg--ok", [-1]: "leave-table__avg--below" };

      plan.markup = html`<div class="leave-plan__head">
          <span>If you leave…</span>
          <span>Month avg so far <strong>${currentAvg === null ? "—" : formatHours(currentAvg, 2)}</strong></span>
        </div>
        <table class="leave-table">
          <thead>
            <tr>
              <th scope="col">Leave</th>
              <th scope="col">Today</th>
              <th scope="col">Month end</th>
            </tr>
          </thead>
          <tbody>
            ${rows.map((row) => {
              const vs = versusTarget(row.average);

              return html`<tr class="${row.kinds.includes("now") ? "" : "leave-table__goal"}">
                <th scope="row">
                  <strong>${row.kinds.includes("now") ? formatClock(now) : formatTime(row.at)}</strong>
                  <span>${label(row)} · out ${formatTime(row.out)}</span>
                </th>
                <td>${formatHours(row.hours)}</td>
                <td class="${CLASS[vs]}">
                  ${formatHours(row.average, 2)}
                  <span class="leave-table__trend" aria-label="${vs > 0 ? "above" : vs < 0 ? "below" : "on"} target">${ARROW[vs]}</span>
                </td>
              </tr>`;
            })}
          </tbody>
        </table>
        <p class="leave-plan__tip">
          Month end vs your ${formatHours(settings.target)}
          target${restDays > 0 ? `, assuming your other ${plural(restDays, "office day")} at ${formatHours(restHours, 1)}` : ""}.
        </p>
        ${next && html`<p class="leave-plan__tip">Leave after ${formatTime(next.at)} and the timesheet rounds up to ${formatTime(next.out)} (${formatHours(next.hours)}).</p>`}`.value;
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

      if (todayHoliday) {
        plan.quick = "";

        return;
      }

      if (todayDay && todayDay.status !== "office") {
        plan.quick = html`<span class="text-dim text-small">Marked ${STATUS_LABEL[todayDay.status]} today.</span>
          <button type="button" class="link-btn" data-action="today-status" data-value="office">Undo</button>`.value;

        return;
      }

      const late = isWeekday(ui.today) && minutesOf(now) >= LATE_PROMPT_MINUTES;

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
