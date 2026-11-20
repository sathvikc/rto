/** DOM helpers: typed element lookup and an auto-escaping HTML template tag. */

/**
 * Element by id, checked at runtime and typed for the caller.
 * @template {typeof HTMLElement} C
 * @param {string} id
 * @param {C} [type]  Expected constructor, e.g. HTMLSelectElement.
 * @returns {InstanceType<C>}
 */
export function byId(id, type) {
  const el = document.getElementById(id);
  const ctor = type ?? HTMLElement;

  if (!(el instanceof ctor)) throw new Error(`#${id} is missing or not a ${ctor.name}`);

  return /** @type {InstanceType<C>} */ (el);
}

/** Markup that has already been escaped or is trusted. */
export class SafeHtml {
  /** @param {string} value */
  constructor(value) {
    this.value = value;
  }

  toString() {
    return this.value;
  }
}

const ENTITIES = /** @type {const} */ ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" });

/** @param {string} value */
export const escapeHtml = (value) => value.replace(/[&<>"']/g, (c) => ENTITIES[/** @type {keyof typeof ENTITIES} */ (c)]);

/**
 * @param {unknown} value
 * @returns {string}
 */
function toMarkup(value) {
  if (value === null || value === undefined || value === false) return "";
  if (value instanceof SafeHtml) return value.value;
  if (Array.isArray(value)) return value.map(toMarkup).join("");

  return escapeHtml(String(value));
}

/**
 * Tagged template that escapes every interpolated value unless it is
 * SafeHtml (nested `html` results) or an array of them. null, undefined
 * and false render nothing, so `${cond && html`...`}` works.
 * @param {TemplateStringsArray} strings
 * @param {...unknown} values
 */
export function html(strings, ...values) {
  let out = strings[0];

  values.forEach((value, i) => {
    out += toMarkup(value) + strings[i + 1];
  });

  return new SafeHtml(out);
}

/**
 * Trusted markup produced by our own code (e.g. generated SVG).
 * @param {string} markup
 */
export const trusted = (markup) => new SafeHtml(markup);

/**
 * @param {Element} el
 * @param {SafeHtml} content
 */
export function render(el, content) {
  el.innerHTML = content.value;
}
