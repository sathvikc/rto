/**
 * Click handling through one delegated listener. Elements declare
 * `data-action="name"`; views register handlers by name.
 */

/** @typedef {(el: HTMLElement, event: MouseEvent) => unknown} ActionHandler */

/** @type {Map<string, ActionHandler>} */
const handlers = new Map();

/** @param {Record<string, ActionHandler>} map */
export function registerActions(map) {
  for (const [name, handler] of Object.entries(map)) {
    if (handlers.has(name)) throw new Error(`Action "${name}" is already registered`);

    handlers.set(name, handler);
  }
}

/** @param {MouseEvent} event */
function onClick(event) {
  const target = event.target instanceof Element ? event.target.closest("[data-action]") : null;

  if (!(target instanceof HTMLElement) || target.matches(":disabled")) return;

  const handler = handlers.get(target.dataset.action ?? "");

  if (!handler) return;

  event.preventDefault();
  Promise.resolve(handler(target, event)).catch((error) => console.error(`Action "${target.dataset.action}" failed`, error));
}

/** @returns {() => void} cleanup */
export function listenForActions() {
  document.addEventListener("click", onClick);

  return () => document.removeEventListener("click", onClick);
}
