import { w as withReadObserver } from "./shared-D6eU3LnD.mjs";
import { a as logWarn, l as logError } from "./shared-DmpHYKx7.mjs";
const boolHandler = (name) => ({
  attr: `data-${name}`,
  apply(el, val) {
    el[name] = Boolean(val);
  }
});
const ariaHandler = (name) => ({
  attr: `data-${name}`,
  apply(el, val) {
    el.setAttribute(name, val ? "true" : "false");
  }
});
const DEFAULT_HANDLERS = [
  boolHandler("hidden"),
  boolHandler("disabled"),
  boolHandler("checked"),
  boolHandler("required"),
  ariaHandler("aria-expanded"),
  ariaHandler("aria-hidden")
];
function mergeHandlers(defaults, userHandlers) {
  if (!userHandlers.length) return defaults;
  const merged = /* @__PURE__ */ new Map();
  for (const h of defaults) merged.set(h.attr, h);
  for (const h of userHandlers.flat()) merged.set(h.attr, h);
  return [...merged.values()];
}
function bindDom(root, store, options = {}) {
  if (!(root instanceof HTMLElement)) {
    throw new Error("bindDom() requires a valid HTMLElement as root");
  }
  if (!store || typeof store !== "object") {
    throw new Error("bindDom() requires a reactive state object");
  }
  const { immediate = false, handlers: userHandlers = [] } = options;
  const handlers = mergeHandlers(DEFAULT_HANDLERS, userHandlers);
  const performBinding = () => {
    const cleanups = [];
    const bindingMap = /* @__PURE__ */ new WeakMap();
    const selector = ["[data-bind]", ...handlers.map((h) => `[${h.attr}]`)].join(",");
    const elements = root.querySelectorAll(selector);
    for (const el of elements) {
      if (el.hasAttribute("data-bind")) {
        const c = handleDataBind(el, store, el.getAttribute("data-bind"), bindingMap);
        if (c) cleanups.push(c);
      }
      for (const handler of handlers) {
        if (el.hasAttribute(handler.attr)) {
          const c = applyHandler(el, store, el.getAttribute(handler.attr), handler);
          if (c) cleanups.push(c);
        }
      }
    }
    const inputHandler = (e) => {
      const binding = bindingMap.get(e.target);
      if (binding) binding.target[binding.key] = getInputValue(e.target);
    };
    root.addEventListener("input", inputHandler);
    cleanups.push(() => root.removeEventListener("input", inputHandler));
    return () => cleanups.forEach((c) => c());
  };
  if (!immediate && document.readyState === "loading") {
    let cleanup = null;
    const onReady = () => {
      cleanup = performBinding();
    };
    document.addEventListener("DOMContentLoaded", onReady, { once: true });
    return () => cleanup ? cleanup() : document.removeEventListener("DOMContentLoaded", onReady);
  }
  return performBinding();
}
function applyHandler(el, store, path, handler) {
  const result = resolveProp(store, path);
  if (!result) return null;
  const { target, key } = result;
  return target.$subscribe(key, (val) => handler.apply(el, val));
}
function handleDataBind(el, store, path, bindingMap) {
  const result = resolveProp(store, path);
  if (!result) return null;
  const { target, key } = result;
  const unsub = target.$subscribe(key, (val) => applyBindValue(el, val));
  if (isFormInput(el)) {
    bindingMap.set(el, { target, key });
  }
  return unsub;
}
function resolvePath(obj, pathArr) {
  if (!pathArr || pathArr.length === 0) {
    return obj;
  }
  let current = obj;
  for (let i = 0; i < pathArr.length; i++) {
    const key = pathArr[i];
    if (current === null || current === void 0) {
      return null;
    }
    if (!(key in current)) {
      return null;
    }
    current = current[key];
  }
  return current;
}
function resolveProp(store, path) {
  if (!path) return null;
  const pathArr = path.split(".");
  const key = pathArr.pop();
  const target = resolvePath(store, pathArr);
  if (target === null || target === void 0) {
    logWarn(`[Lume.js] Invalid path "${path}"`);
    return null;
  }
  if (!target?.$subscribe) {
    logWarn(`[Lume.js] Target for "${path}" is not reactive`);
    return null;
  }
  return { target, key };
}
function applyBindValue(el, val) {
  if (el.tagName === "INPUT") {
    if (el.type === "checkbox") el.checked = Boolean(val);
    else if (el.type === "radio") el.checked = el.value === String(val);
    else el.value = val ?? "";
  } else if (el.tagName === "TEXTAREA" || el.tagName === "SELECT") {
    el.value = val ?? "";
  } else {
    el.textContent = val ?? "";
  }
}
function getInputValue(el) {
  if (el.type === "checkbox") return el.checked;
  if (el.type === "number" || el.type === "range") return el.valueAsNumber;
  return el.value;
}
function isFormInput(el) {
  return el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT";
}
let currentEffect = null;
function autoTrackedEffect(fn) {
  const deps = /* @__PURE__ */ new Map();
  let totalDeps = 0;
  let runGen = 0;
  let gen = 0;
  let seen = 0;
  let added = 0;
  let isRunning = false;
  const context = {};
  const onRead = (proxy, key, registerEffect) => {
    if (currentEffect !== context) return;
    let byKey = deps.get(proxy);
    if (!byKey) {
      byKey = /* @__PURE__ */ new Map();
      deps.set(proxy, byKey);
    }
    const rec = byKey.get(key);
    if (rec) {
      if (rec.gen !== gen) {
        rec.gen = gen;
        seen++;
      }
      return;
    }
    byKey.set(key, { unsub: registerEffect(key, run), gen });
    added++;
    totalDeps++;
  };
  function sweep() {
    for (const [proxy, byKey] of deps) {
      for (const [key, rec] of byKey) {
        if (rec.gen !== gen) {
          rec.unsub();
          byKey.delete(key);
          totalDeps--;
        }
      }
      if (byKey.size === 0) deps.delete(proxy);
    }
  }
  function run() {
    if (isRunning) return;
    gen = ++runGen;
    seen = 0;
    added = 0;
    const previousEffect = currentEffect;
    currentEffect = context;
    isRunning = true;
    try {
      withReadObserver(onRead, fn);
    } catch (error) {
      logError("[Lume.js effect] Error in effect:", error);
      throw error;
    } finally {
      currentEffect = previousEffect;
      isRunning = false;
    }
    if (seen + added > 0 && seen < totalDeps - added) sweep();
  }
  run();
  return () => {
    for (const byKey of deps.values()) {
      for (const rec of byKey.values()) rec.unsub();
    }
    deps.clear();
    totalDeps = 0;
  };
}
function effect(fn, deps) {
  if (typeof fn !== "function") {
    throw new Error("effect() requires a function");
  }
  if (!Array.isArray(deps)) {
    return autoTrackedEffect(fn);
  }
  const cleanups = [];
  let isRunning = false;
  const execute = () => {
    if (isRunning) return;
    isRunning = true;
    try {
      fn();
    } catch (error) {
      logError("[Lume.js effect] Error in effect:", error);
      throw error;
    } finally {
      isRunning = false;
    }
  };
  let scheduled = false;
  let disposed = false;
  cleanups.push(() => {
    disposed = true;
  });
  const scheduleExecute = () => {
    if (scheduled) return;
    scheduled = true;
    queueMicrotask(() => {
      scheduled = false;
      if (disposed) return;
      try {
        execute();
      } catch {
      }
    });
  };
  for (const dep of deps) {
    if (Array.isArray(dep) && dep.length >= 2) {
      const [store, ...keys] = dep;
      if (store && typeof store.$subscribe === "function") {
        for (const key of keys) {
          let isFirst = true;
          const unsub = store.$subscribe(key, () => {
            if (isFirst) {
              isFirst = false;
              return;
            }
            scheduleExecute();
          });
          cleanups.push(unsub);
        }
      }
    }
  }
  execute();
  return () => {
    while (cleanups.length) cleanups.pop()();
  };
}
export {
  applyBindValue as a,
  bindDom as b,
  effect as e
};
