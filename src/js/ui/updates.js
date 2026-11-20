/**
 * Service worker registration and app updates.
 *
 * A Home Screen app can stay alive for days, so it checks for a new
 * version whenever it comes back to the foreground. When a new version has
 * installed and taken over, a toast offers to reload into it.
 */
import { toast } from "../state/store.js";

/** Don't ask the server more often than this. */
const CHECK_INTERVAL_MS = 60_000;

const UPDATE_TOAST_MS = 30_000;

/** @returns {() => void} cleanup */
export function setUpUpdates() {
  if (!("serviceWorker" in navigator) || location.protocol === "file:") return () => {};

  // Only an update replaces an existing controller; a first install doesn't.
  let hadController = navigator.serviceWorker.controller !== null;
  let lastCheck = 0;

  /** @type {ServiceWorkerRegistration | null} */
  let registration = null;

  // updateViaCache "none": fetch sw.js itself past the HTTP cache too.
  navigator.serviceWorker
    .register("sw.js", { updateViaCache: "none" })
    .then((reg) => {
      registration = reg;
    })
    .catch((error) => console.warn("Service worker registration failed", error));

  const onControllerChange = () => {
    if (hadController) toast("A new version is ready", ["reload"], UPDATE_TOAST_MS);

    hadController = true;
  };

  const checkForUpdate = () => {
    if (document.visibilityState !== "visible" || !registration) return;

    if (Date.now() - lastCheck < CHECK_INTERVAL_MS) return;

    lastCheck = Date.now();

    registration.update().catch(() => {
      // Offline: try again next time.
    });
  };

  navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);
  document.addEventListener("visibilitychange", checkForUpdate);

  return () => {
    navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
    document.removeEventListener("visibilitychange", checkForUpdate);
  };
}
