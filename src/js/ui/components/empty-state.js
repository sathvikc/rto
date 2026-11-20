/** Placeholder shown where a list or chart has nothing yet. */
import { html } from "../dom.js";

/** @import { SafeHtml } from "../dom.js" */

/**
 * @param {object} props
 * @param {string} props.text
 * @param {SafeHtml | false | null} [props.actions]  Buttons, centered under the text.
 * @param {string} [props.hint]
 * @param {boolean} [props.compact]  Smaller, for use inside a card.
 * @param {"div" | "li"} [props.tag]  "li" inside a list.
 */
export function emptyState({ text, actions, hint, compact = false, tag = "div" }) {
  const body = html`<p>${text}</p>
    ${actions && html`<div class="cluster cluster--center">${actions}</div>`} ${hint && html`<p class="field__hint">${hint}</p>`}`;

  const className = `empty${compact ? " empty--compact" : ""}`;

  return tag === "li" ? html`<li class="${className}">${body}</li>` : html`<div class="${className}">${body}</div>`;
}
