/**
 * Bottom-bar tabs, routed by the URL hash (#home, #history, #settings) so
 * links and reloads land on the right tab.
 */
/** @import { Tab } from "../state/store.js" */
import { effect } from "lume-js";
import { ui } from "../state/store.js";
import { registerActions } from "./actions.js";
import { closeDialogs } from "./dialogs.js";

/** @type {readonly Tab[]} */
const TABS = ["home", "history", "settings"];

/**
 * @param {string} hash
 * @returns {Tab}
 */
function tabFromHash(hash) {
  const name = hash.replace(/^#/, "");

  return /** @type {Tab} */ (TABS.includes(/** @type {Tab} */ (name)) ? name : "home");
}

/** @param {Tab} tab */
export function goToTab(tab) {
  if (location.hash !== `#${tab}`) location.hash = tab;
  else ui.tab = tab;
}

/** @returns {() => void} cleanup */
export function setUpTabs() {
  const onHashChange = () => {
    ui.tab = tabFromHash(location.hash);
  };

  onHashChange();
  window.addEventListener("hashchange", onHashChange);

  const stop = effect(() => {
    const active = ui.tab;

    for (const panel of document.querySelectorAll("[data-tab]")) {
      if (panel instanceof HTMLElement) panel.hidden = panel.dataset.tab !== active;
    }

    for (const link of document.querySelectorAll("[data-tab-link]")) {
      if (!(link instanceof HTMLElement)) continue;

      if (link.dataset.tabLink === active) link.setAttribute("aria-current", "page");
      else link.removeAttribute("aria-current");
    }

    closeDialogs();
    window.scrollTo({ top: 0 });
  });

  registerActions({
    "go-history": () => goToTab("history"),
    "go-settings": () => goToTab("settings"),
  });

  return () => {
    stop();
    window.removeEventListener("hashchange", onHashChange);
  };
}
