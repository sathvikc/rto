/**
 * Native <dialog> bottom sheets: open/close, backdrop click to close, and
 * page scroll locking while any sheet is open.
 */
import { registerActions } from "./actions.js";

const LOCK_CLASS = "is-modal-open";

/** @param {HTMLDialogElement} dialog */
export function openDialog(dialog) {
  if (!dialog.open) dialog.showModal();
  document.documentElement.classList.add(LOCK_CLASS);
  dialog.scrollTop = 0;
}

export function closeDialogs() {
  for (const dialog of document.querySelectorAll("dialog[open]")) {
    if (dialog instanceof HTMLDialogElement) dialog.close();
  }
}

/** @returns {() => void} cleanup */
export function setUpDialogs() {
  const unlock = () => {
    if (!document.querySelector("dialog[open]")) document.documentElement.classList.remove(LOCK_CLASS);
  };
  /** @param {MouseEvent} event */
  const closeOnBackdrop = (event) => {
    const dialog = event.currentTarget;
    if (dialog instanceof HTMLDialogElement && event.target === dialog) dialog.close();
  };
  const dialogs = [...document.querySelectorAll("dialog")];
  for (const dialog of dialogs) {
    dialog.addEventListener("close", unlock);
    dialog.addEventListener("click", closeOnBackdrop);
  }
  registerActions({ "close-dialog": closeDialogs });
  return () => {
    for (const dialog of dialogs) {
      dialog.removeEventListener("close", unlock);
      dialog.removeEventListener("click", closeOnBackdrop);
    }
  };
}
