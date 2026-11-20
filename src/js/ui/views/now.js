/** Top of the page: date, live clock, punch button, today's day type. */
import { bindDom, effect, state } from "lume-js";
import { createCleanupGroup } from "lume-js/addons";
import { classToggle } from "lume-js/handlers";
import { STATUS_LABEL } from "../../domain/constants.js";
import { toDateKey } from "../../domain/dates.js";
import { resolveDay } from "../../domain/days.js";
import { describeRule } from "../../domain/rounding.js";
import { toMinutes } from "../../domain/time.js";
import { formatClock, formatHours, formatLongDate, formatTime } from "../../lib/format.js";
import { model } from "../../state/model.js";
import { data, punch, setTodayStatus, ui } from "../../state/store.js";
import { registerActions } from "../actions.js";
import { byId, html, render } from "../dom.js";

/** @import { DayStatus } from "../../domain/types.js" */

const QUICK_STATUSES = /** @type {const} */ (["wfh", "ooo", "sick"]);

export function mountNow() {
  const group = createCleanupGroup();

  const view = state({
    dateLine: "",
    clockText: "",
    secondsText: "",
    statusLine: "",
    detailLine: "",
    punchLabel: "Clock in",
    isOpen: false,
    punchDisabled: true,
    roundingNote: "",
  });

  // Ticks every second: clock, plus elapsed time while on the clock.
  group.add(
    effect(() => {
      const now = new Date(ui.nowMs);
      const open = model.openDay;

      view.dateLine = formatLongDate(now);
      const [clock, period] = formatClock(now).split(" ");

      view.clockText = `${clock} ${period}`;
      view.secondsText = String(now.getSeconds()).padStart(2, "0");

      if (open?.recorded?.start) {
        const minutesNow = now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60;
        const overnight = open.date === toDateKey(now) ? 0 : 1440;
        const elapsed = Math.max(0, (minutesNow + overnight - toMinutes(open.recorded.start)) / 60);

        view.statusLine = "On the clock";
        view.detailLine = `Started ${formatTime(open.recorded.start)} · ${formatHours(elapsed, 1)} elapsed`;
      }
    }),
  );

  // Changes only when the day's records change.
  group.add(
    effect(() => {
      const { openDay, todayDay, todayHoliday } = model;
      const { settings, loaded } = data;

      view.isOpen = openDay !== null;
      view.punchLabel = openDay ? "Clock out" : "Clock in";
      view.punchDisabled = !loaded;
      view.roundingNote = `Timesheet prediction: clock-in ${describeRule(settings.roundIn)}; clock-out ${describeRule(settings.roundOut)}.`;

      if (openDay) return; // The ticking effect owns the status lines.

      if (todayDay && todayDay.status !== "office") {
        view.statusLine = `Today: ${STATUS_LABEL[todayDay.status]}`;
        view.detailLine = "Not an office day.";
      } else if (todayDay?.recorded?.end) {
        const r = resolveDay(todayDay, settings);

        view.statusLine = "Done for today";
        view.detailLine = `${formatTime(todayDay.recorded.start)} → ${formatTime(todayDay.recorded.end)} · ${formatHours(r.work)}${r.verified ? "" : " *"}`;
      } else {
        view.statusLine = "Off the clock";
        view.detailLine = todayHoliday ? `Company holiday${todayHoliday.name ? `: ${todayHoliday.name}` : ""}` : "Not clocked in";
      }
    }),
  );

  // Quick day type for today.
  const quick = byId("today-status");

  group.add(
    effect(() => {
      const { openDay, todayDay } = model;

      if (openDay) {
        render(quick, html``);
      } else if (todayDay && todayDay.status !== "office") {
        render(
          quick,
          html`<span class="text-dim text-small">Marked ${STATUS_LABEL[todayDay.status]} for today.</span>
            ${!todayDay.actual && html`<button type="button" class="link-btn" data-action="today-status" data-value="office">Undo</button>`}`,
        );
      } else if (todayDay?.recorded?.start || todayDay?.actual) {
        render(quick, html``);
      } else {
        render(
          quick,
          html`<span class="text-dim text-small">Not in the office today?</span>
            <span class="cluster">
              ${QUICK_STATUSES.map((s) => html`<button type="button" class="chip" data-action="today-status" data-value="${s}">${STATUS_LABEL[s]}</button>`)}
            </span>`,
        );
      }
    }),
  );

  registerActions({
    punch: () => punch(),
    "today-status": (el) => setTodayStatus(/** @type {DayStatus} */ (el.dataset.value)),
  });

  group.add(bindDom(byId("now"), view, { handlers: [classToggle("punch--out")] }));

  return () => group.dispose();
}
