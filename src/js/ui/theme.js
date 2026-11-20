/**
 * Theme preference (system / light / dark). Stored in localStorage because
 * it must apply before first paint (see the inline script in index.html).
 */
import { effect, state } from "lume-js";

/** @typedef {"system" | "light" | "dark"} ThemePref */

const STORAGE_KEY = "rto-theme";
const META_COLOR = { light: "#f4f1ea", dark: "#171612" };
const darkQuery = window.matchMedia("(prefers-color-scheme: dark)");

/** @returns {ThemePref} */
function readPref() {
  try {
    const value = localStorage.getItem(STORAGE_KEY);

    return value === "light" || value === "dark" ? value : "system";
  } catch {
    return "system";
  }
}

export const theme = state({ pref: readPref(), systemDark: darkQuery.matches });

/** @returns {() => void} cleanup */
export function setUpTheme() {
  const onSystemChange = () => {
    theme.systemDark = darkQuery.matches;
  };

  darkQuery.addEventListener("change", onSystemChange);

  const stop = effect(() => {
    const { pref, systemDark } = theme;
    const root = document.documentElement;

    if (pref === "system") delete root.dataset.theme;
    else root.dataset.theme = pref;

    try {
      localStorage.setItem(STORAGE_KEY, pref);
    } catch {
      // Storage blocked: the choice lasts for this session only.
    }

    const dark = pref === "dark" || (pref === "system" && systemDark);

    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", dark ? META_COLOR.dark : META_COLOR.light);
  });

  return () => {
    stop();
    darkQuery.removeEventListener("change", onSystemChange);
  };
}
