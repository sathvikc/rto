/** Entry point: load data, mount views, start the clock, set up offline and updates. */
import { batch } from "lume-js";
import { createCleanupGroup } from "lume-js/addons";
import { toDateKey } from "./domain/dates.js";
import "./state/model.js";
import { flush, loadState, ui } from "./state/store.js";
import { listenForActions } from "./ui/actions.js";
// Expands the <ui-*> components in index.html; must run before views mount.
import "./ui/elements.js";
import { setUpDialogs } from "./ui/dialogs.js";
import { setUpTabs } from "./ui/tabs.js";
import { setUpTheme } from "./ui/theme.js";
import { setUpUpdates } from "./ui/updates.js";
import { mountAlerts } from "./ui/views/alerts.js";
import { mountCharts } from "./ui/views/charts.js";
import { mountDayDialog } from "./ui/views/day-dialog.js";
import { mountHistory } from "./ui/views/history.js";
import { mountMonthCard } from "./ui/views/month-card.js";
import { mountMonthSummary } from "./ui/views/month-summary.js";
import { mountNow } from "./ui/views/now.js";
import { mountPunchDialog } from "./ui/views/punch-dialog.js";
import { mountSettings } from "./ui/views/settings.js";
import { mountToast } from "./ui/views/toast.js";
import { mountVerifyDialog } from "./ui/views/verify-dialog.js";

const TICK_MS = 1000;

function tick() {
  const now = new Date();
  const today = toDateKey(now);

  batch(() => {
    ui.nowMs = now.getTime();

    if (ui.today !== today) ui.today = today;
  });
}

async function start() {
  const app = createCleanupGroup();

  app.add(setUpTheme());
  app.add(setUpDialogs());
  app.add(listenForActions());
  app.add(setUpTabs());

  // Home
  app.add(mountNow());
  app.add(mountAlerts());
  app.add(mountMonthCard());

  // History
  app.add(mountMonthSummary());
  app.add(mountCharts());
  app.add(mountHistory());

  // Settings
  app.add(mountSettings());

  // Sheets and feedback
  app.add(mountPunchDialog());
  app.add(mountDayDialog());
  app.add(mountVerifyDialog());
  app.add(mountToast());

  await loadState();
  tick();

  const timer = setInterval(tick, TICK_MS);

  app.add(() => clearInterval(timer));

  // iOS can suspend a backgrounded app at any time: save on the way out.
  const onVisibility = () => {
    if (document.visibilityState !== "hidden") {
      tick();

      return;
    }

    // Commit a field still being edited (inputs save on "change", which
    // fires on blur), then save once that change has gone through.
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();

    queueMicrotask(() => void flush());
  };

  const onPageHide = () => void flush();

  document.addEventListener("visibilitychange", onVisibility);
  window.addEventListener("pagehide", onPageHide);

  app.add(() => {
    document.removeEventListener("visibilitychange", onVisibility);
    window.removeEventListener("pagehide", onPageHide);
  });

  app.add(setUpUpdates());
}

start().catch((error) => console.error("RTO failed to start", error));
