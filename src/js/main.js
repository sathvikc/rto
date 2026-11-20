/** Entry point: load data, mount views, start the clock, register the service worker. */
import { batch, bindDom } from "lume-js";
import { createCleanupGroup } from "lume-js/addons";
import { show } from "lume-js/handlers";
import { toDateKey } from "./domain/dates.js";
import { flush, loadState, ui } from "./state/store.js";
import "./state/model.js";
import { listenForActions } from "./ui/actions.js";
import { setUpDialogs } from "./ui/dialogs.js";
import { byId } from "./ui/dom.js";
import { setUpTheme } from "./ui/theme.js";
import { mountAlerts } from "./ui/views/alerts.js";
import { mountCharts } from "./ui/views/charts.js";
import { mountDayDialog } from "./ui/views/day-dialog.js";
import { mountHistory } from "./ui/views/history.js";
import { mountNow } from "./ui/views/now.js";
import { mountSettingsDialog } from "./ui/views/settings-dialog.js";
import { mountSummary } from "./ui/views/summary.js";
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

function registerServiceWorker() {
  if (!("serviceWorker" in navigator) || location.protocol === "file:") return;
  navigator.serviceWorker.register("sw.js").catch((error) => console.warn("Service worker registration failed", error));
}

async function start() {
  const app = createCleanupGroup();
  app.add(setUpTheme());
  app.add(setUpDialogs());
  app.add(listenForActions());
  app.add(mountNow());
  app.add(mountAlerts());
  app.add(mountSummary());
  app.add(mountCharts());
  app.add(mountHistory());
  app.add(mountDayDialog());
  app.add(mountVerifyDialog());
  app.add(mountSettingsDialog());
  app.add(bindDom(byId("toast-region"), ui, { handlers: [show] }));

  await loadState();
  tick();
  const timer = setInterval(tick, TICK_MS);
  app.add(() => clearInterval(timer));

  // iOS can suspend a backgrounded app at any time: save on the way out.
  const onVisibility = () => (document.visibilityState === "hidden" ? flush() : tick());
  const onPageHide = () => void flush();
  document.addEventListener("visibilitychange", onVisibility);
  window.addEventListener("pagehide", onPageHide);
  app.add(() => {
    document.removeEventListener("visibilitychange", onVisibility);
    window.removeEventListener("pagehide", onPageHide);
  });

  registerServiceWorker();
}

start().catch((error) => console.error("RTO failed to start", error));
