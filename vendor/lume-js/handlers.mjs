import { a as logWarn } from "./shared-DmpHYKx7.mjs";
const show = {
  attr: "data-show",
  apply(el, val) {
    el.hidden = !Boolean(val);
  }
};
const className = {
  attr: "data-classname",
  apply(el, val) {
    el.className = val || "";
  }
};
function boolAttr(name) {
  return {
    attr: `data-${name}`,
    apply(el, val) {
      el.toggleAttribute(name, Boolean(val));
    }
  };
}
function ariaAttr(name) {
  const fullName = name.startsWith("aria-") ? name : `aria-${name}`;
  return {
    attr: `data-${fullName}`,
    apply(el, val) {
      el.setAttribute(fullName, val ? "true" : "false");
    }
  };
}
function classToggle(...names) {
  return names.map((name) => ({
    attr: `data-class-${name}`,
    apply(el, val) {
      el.classList.toggle(name, Boolean(val));
    }
  }));
}
const DANGEROUS_SCHEME = /^(?:javascript:|vbscript:|data:text\/html)/;
const IGNORED_URL_CHARS = /[\u0000-\u0020\u007F]/g;
const URI_ATTRS = /* @__PURE__ */ new Set(["href", "src", "action", "srcset", "poster", "formaction"]);
function stringAttr(name) {
  return {
    attr: `data-${name}`,
    apply(el, val) {
      if (val == null) {
        el.removeAttribute(name);
        return;
      }
      const strVal = String(val);
      if (URI_ATTRS.has(name) && DANGEROUS_SCHEME.test(strVal.replace(IGNORED_URL_CHARS, "").toLowerCase())) {
        el.removeAttribute(name);
        return;
      }
      el.setAttribute(name, strVal);
    }
  };
}
const attached = /* @__PURE__ */ new WeakMap();
function on(...types) {
  return types.map((type) => ({
    attr: `data-on${type}`,
    apply(el, val) {
      let byType = attached.get(el);
      const prev = byType ? byType.get(type) : void 0;
      if (prev) {
        el.removeEventListener(type, prev);
        byType.delete(type);
      }
      if (typeof val === "function") {
        el.addEventListener(type, val);
        if (!byType) {
          byType = /* @__PURE__ */ new Map();
          attached.set(el, byType);
        }
        byType.set(type, val);
      } else if (val != null) {
        logWarn(`[Lume.js] on('${type}'): bound value is not a function — listener detached`);
      }
    }
  }));
}
const BOOL_ATTRS = [
  "readonly",
  "open",
  "novalidate",
  "formnovalidate",
  "multiple",
  "autofocus",
  "autoplay",
  "controls",
  "loop",
  "muted",
  "defer",
  "async",
  "reversed",
  "selected",
  "inert",
  "allowfullscreen"
];
const STRING_ATTRS = [
  "href",
  "src",
  "alt",
  "title",
  "placeholder",
  "action",
  "method",
  "target",
  "rel",
  "type",
  "name",
  "role",
  "lang",
  "tabindex",
  "pattern",
  "min",
  "max",
  "step",
  "minlength",
  "maxlength",
  "width",
  "height",
  "for",
  "form",
  "accept",
  "autocomplete",
  "loading",
  "decoding",
  "inputmode",
  "enterkeyhint",
  "draggable",
  "contenteditable",
  "spellcheck",
  "translate",
  "dir",
  "id",
  "poster",
  "preload",
  "download",
  "media",
  "sizes",
  "srcset",
  "colspan",
  "rowspan",
  "scope",
  "headers",
  "wrap",
  "sandbox"
];
const ARIA_BOOL_ATTRS = [
  "pressed",
  "selected",
  "disabled",
  "checked",
  "invalid",
  "required",
  "busy",
  "modal",
  "multiselectable",
  "multiline",
  "readonly",
  "atomic"
];
const ARIA_STRING_ATTRS = [
  "current",
  "live",
  "relevant",
  "haspopup",
  "sort",
  "autocomplete",
  "orientation",
  "label",
  "describedby",
  "labelledby",
  "controls",
  "owns",
  "activedescendant",
  "errormessage",
  "details",
  "flowto",
  "valuenow",
  "valuemin",
  "valuemax",
  "valuetext",
  "colcount",
  "colindex",
  "colspan",
  "rowcount",
  "rowindex",
  "rowspan",
  "level",
  "setsize",
  "posinset",
  "placeholder",
  "roledescription",
  "keyshortcuts",
  "braillelabel",
  "brailleroledescription"
];
function htmlAttrs() {
  return [
    show,
    ...BOOL_ATTRS.map((name) => boolAttr(name)),
    ...STRING_ATTRS.map((name) => stringAttr(name)),
    ...ARIA_BOOL_ATTRS.map((name) => ariaAttr(name)),
    ...ARIA_STRING_ATTRS.map((name) => stringAttr(`aria-${name}`))
  ];
}
const formHandlers = [
  boolAttr("readonly")
];
const a11yHandlers = [
  ariaAttr("pressed"),
  ariaAttr("selected"),
  ariaAttr("disabled")
];
export {
  a11yHandlers,
  ariaAttr,
  boolAttr,
  className,
  classToggle,
  formHandlers,
  htmlAttrs,
  on,
  show,
  stringAttr
};
