/**
 * Toast with optional Undo / Adjust. Rendered as a popover so it sits in
 * the top layer, above any open sheet.
 */
import { effect } from "lume-js";
import { createCleanupGroup } from "lume-js/addons";
import { model } from "../../state/model.js";
import { dismissToast, ui, undoLastPunch } from "../../state/store.js";
import { registerActions } from "../actions.js";
import { byId, html, render } from "../dom.js";
import { openPunchDialog } from "./punch-dialog.js";

const LABELS = { undo: "Undo", adjust: "Adjust" };

export function mountToast() {
  const group = createCleanupGroup();
  const el = byId("toast");
  const supportsPopover = typeof el.showPopover === "function";

  if (!supportsPopover) {
    el.removeAttribute("popover");
    el.hidden = true;
  }

  group.add(
    effect(() => {
      const { toast: message, toastActions } = ui;

      render(
        el,
        html`<span class="toast__message">${message}</span>
          ${toastActions.map((a) => html`<button type="button" class="toast__action" data-action="toast-${a}">${LABELS[a]}</button>`)}`,
      );

      if (!supportsPopover) {
        el.hidden = !message;

        return;
      }

      // Re-show on every message so it stays above a sheet opened since.
      if (el.matches(":popover-open")) el.hidePopover();

      if (message) el.showPopover();
    }),
  );

  registerActions({
    "toast-undo": () => undoLastPunch(),
    "toast-adjust": () => {
      dismissToast();
      openPunchDialog(model.openDay ? "start" : "end");
    },
  });

  return () => group.dispose();
}
