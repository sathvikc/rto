import { R as REACTIVE_BRAND } from "./shared-D6eU3LnD.mjs";
import { e as effect, a as applyBindValue } from "./shared-B6kzJYNx.mjs";
import { l as logError, a as logWarn } from "./shared-DmpHYKx7.mjs";
function computed(fn) {
  if (typeof fn !== "function") {
    throw new Error("computed() requires a function");
  }
  let cachedValue;
  let isInitialized = false;
  let isInComputation = false;
  let disposed = false;
  const subscribers = [];
  const cleanupEffect = effect(() => {
    if (isInComputation || disposed) return;
    isInComputation = true;
    try {
      const newValue = fn();
      if (!isInitialized || !Object.is(newValue, cachedValue)) {
        cachedValue = newValue;
        isInitialized = true;
        subscribers.forEach((callback) => callback(cachedValue));
      }
    } catch (error) {
      logError("[Lume.js computed] Error in computation:", error);
      if (!isInitialized || cachedValue !== void 0) {
        cachedValue = void 0;
        isInitialized = true;
        subscribers.forEach((callback) => callback(cachedValue));
      }
    } finally {
      queueMicrotask(() => {
        if (!disposed) {
          isInComputation = false;
        }
      });
    }
  });
  return {
    /**
     * Get the current computed value
     */
    get value() {
      if (!isInitialized) {
        throw new Error("Computed value accessed before initialization");
      }
      return cachedValue;
    },
    /**
     * Subscribe to changes in computed value
     * 
     * @param {function} callback - Called when value changes
     * @returns {function} Unsubscribe function
     */
    subscribe(callback) {
      if (typeof callback !== "function") {
        throw new Error("subscribe() requires a function");
      }
      subscribers.push(callback);
      if (isInitialized) {
        callback(cachedValue);
      }
      return () => {
        const index = subscribers.indexOf(callback);
        if (index > -1) {
          subscribers.splice(index, 1);
        }
      };
    },
    /**
     * Clean up computed value and stop tracking
     */
    dispose() {
      disposed = true;
      cleanupEffect();
      subscribers.length = 0;
      isInitialized = false;
      isInComputation = false;
    }
  };
}
function watch(store, key, callback, { immediate = true } = {}) {
  if (!store.$subscribe) {
    throw new Error("store must be created with state()");
  }
  if (!immediate) {
    let skipped = false;
    return store.$subscribe(key, (val) => {
      if (!skipped) {
        skipped = true;
        return;
      }
      callback(val);
    });
  }
  return store.$subscribe(key, callback);
}
function stableChainMarkers(positions) {
  const n = positions.length;
  const prev = new Array(n);
  const tails = [];
  for (let i = 0; i < n; i++) {
    const v = positions[i];
    if (v < 0) continue;
    let lo = 0;
    let hi = tails.length;
    while (lo < hi) {
      const mid = lo + hi >> 1;
      if (positions[tails[mid]] < v) lo = mid + 1;
      else hi = mid;
    }
    prev[i] = lo > 0 ? tails[lo - 1] : -1;
    tails[lo] = i;
  }
  const settled = new Array(n).fill(false);
  let k = tails.length ? tails[tails.length - 1] : -1;
  while (k !== -1) {
    settled[k] = true;
    k = prev[k];
  }
  return settled;
}
function resolveTemplateEl(template, containerEl) {
  let templateEl = template;
  if (template === true) {
    templateEl = containerEl.querySelector("template");
  } else if (typeof template === "string") {
    templateEl = document.querySelector(template);
  }
  if (!templateEl || templateEl.tagName !== "TEMPLATE") {
    throw new Error("[Lume.js] repeat(): template not found or not a <template> element");
  }
  if (templateEl.content.children.length !== 1) {
    throw new Error("[Lume.js] repeat(): template must contain exactly one root element");
  }
  return templateEl;
}
function resolveTemplate(template, containerEl) {
  if (!template) return { templateRoot: null, keepEl: null };
  const templateEl = resolveTemplateEl(template, containerEl);
  let keepEl = templateEl;
  while (keepEl && keepEl.parentNode !== containerEl) keepEl = keepEl.parentNode;
  return { templateRoot: templateEl.content.firstElementChild, keepEl };
}
function collectItemBindings(el) {
  const bindings = [];
  const add = (node) => {
    const path = node.getAttribute("data-bind");
    bindings.push({ node, path, keys: path === "$item" || path === "$index" ? null : path.split(".") });
  };
  if (el.hasAttribute("data-bind")) add(el);
  for (const node of el.querySelectorAll("[data-bind]")) add(node);
  return bindings;
}
function applyItemBindings(bindings, item, index) {
  for (const b of bindings) {
    let val;
    if (b.path === "$index") {
      val = index;
    } else if (b.path === "$item") {
      val = item;
    } else {
      val = item;
      for (let i = 0; i < b.keys.length && val != null; i++) {
        val = val[b.keys[i]];
      }
    }
    applyBindValue(b.node, val);
  }
}
function defaultFocusPreservation(container) {
  const activeEl = document.activeElement;
  const shouldRestore = container.contains(activeEl);
  if (!shouldRestore) return null;
  let selectionStart = null;
  let selectionEnd = null;
  if (activeEl.tagName === "INPUT" || activeEl.tagName === "TEXTAREA") {
    selectionStart = activeEl.selectionStart;
    selectionEnd = activeEl.selectionEnd;
  }
  return () => {
    if (document.body.contains(activeEl)) {
      activeEl.focus();
      if (selectionStart !== null && selectionEnd !== null) {
        activeEl.setSelectionRange(selectionStart, selectionEnd);
      }
    }
  };
}
function defaultScrollPreservation(container, context = {}) {
  const { isReorder = false } = context;
  const scrollTop = container.scrollTop;
  if (scrollTop === 0) {
    return () => {
      container.scrollTop = 0;
    };
  }
  let anchorElement = null;
  let anchorOffset = 0;
  if (!isReorder) {
    const containerRect = container.getBoundingClientRect();
    for (let child = container.firstElementChild; child; child = child.nextElementSibling) {
      const rect = child.getBoundingClientRect();
      if (rect.bottom > containerRect.top) {
        anchorElement = child;
        anchorOffset = rect.top - containerRect.top;
        break;
      }
    }
  }
  return () => {
    if (anchorElement && document.body.contains(anchorElement)) {
      const newRect = anchorElement.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();
      const currentOffset = newRect.top - containerRect.top;
      const scrollAdjustment = currentOffset - anchorOffset;
      container.scrollTop = container.scrollTop + scrollAdjustment;
    } else {
      container.scrollTop = scrollTop;
    }
  };
}
function repeat(container, store, arrayKey, options) {
  const {
    key,
    render,
    create,
    update,
    remove,
    template = null,
    element = "div",
    preserveFocus = defaultFocusPreservation,
    preserveScroll = defaultScrollPreservation
  } = options;
  const containerEl = typeof container === "string" ? document.querySelector(container) : container;
  if (!containerEl) {
    logWarn(`[Lume.js] repeat(): container "${container}" not found`);
    return () => {
    };
  }
  if (typeof key !== "function") {
    throw new Error("[Lume.js] repeat(): options.key must be a function");
  }
  const { templateRoot, keepEl } = resolveTemplate(template, containerEl);
  if (templateRoot && typeof render === "function") {
    logWarn("[Lume.js] repeat(): options.render is ignored when options.template is set — use create/update instead");
  }
  if (!templateRoot && typeof render !== "function" && typeof create !== "function") {
    throw new Error("[Lume.js] repeat(): options.render or options.create must be a function");
  }
  const elementsByKey = /* @__PURE__ */ new Map();
  const prevItemsByKey = /* @__PURE__ */ new Map();
  const prevIndexByKey = /* @__PURE__ */ new Map();
  const cleanupByKey = /* @__PURE__ */ new Map();
  const bindingsByKey = /* @__PURE__ */ new Map();
  const seenKeys = /* @__PURE__ */ new Set();
  function createElement() {
    if (templateRoot) return templateRoot.cloneNode(true);
    return typeof element === "function" ? element() : document.createElement(element);
  }
  function clearContainer() {
    let node = containerEl.firstChild;
    while (node) {
      const next = node.nextSibling;
      if (node !== keepEl) containerEl.removeChild(node);
      node = next;
    }
  }
  function reconcileDOM(container2, nextEls) {
    const staying = new Set(nextEls);
    let node = container2.firstChild;
    while (node) {
      const next = node.nextSibling;
      if (node !== keepEl && !staying.has(node)) container2.removeChild(node);
      node = next;
    }
    const prevIndex = /* @__PURE__ */ new Map();
    let pi = 0;
    for (let el = container2.firstElementChild; el; el = el.nextElementSibling) {
      if (el !== keepEl) prevIndex.set(el, pi++);
    }
    const positions = new Array(nextEls.length);
    for (let i = 0; i < nextEls.length; i++) {
      const p = prevIndex.get(nextEls[i]);
      positions[i] = p === void 0 ? -1 : p;
    }
    const settled = stableChainMarkers(positions);
    let anchor = null;
    for (let i = nextEls.length - 1; i >= 0; i--) {
      const el = nextEls[i];
      if (settled[i]) {
        anchor = el;
        continue;
      }
      container2.insertBefore(el, anchor);
      anchor = el;
    }
  }
  function applyPreservation(container2, fn, isReorder) {
    const shouldPreserve = document.body.contains(container2);
    const restoreFocus = shouldPreserve && preserveFocus ? preserveFocus(container2) : null;
    const restoreScroll = shouldPreserve && preserveScroll ? preserveScroll(container2, { isReorder }) : null;
    fn();
    if (restoreFocus) restoreFocus();
    if (restoreScroll) restoreScroll();
  }
  function updateList() {
    const items = store[arrayKey];
    if (!Array.isArray(items)) {
      logWarn(`[Lume.js] repeat(): store.${arrayKey} is not an array`);
      return;
    }
    let isReorder = false;
    if (preserveScroll && elementsByKey.size === items.length) {
      isReorder = true;
      for (let i = 0; i < items.length; i++) {
        if (!elementsByKey.has(key(items[i]))) {
          isReorder = false;
          break;
        }
      }
    }
    seenKeys.clear();
    const nextEls = [];
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const k = key(item);
      if (seenKeys.has(k)) {
        logWarn(`[Lume.js] repeat(): duplicate key "${k}"`);
        continue;
      }
      seenKeys.add(k);
      let el = elementsByKey.get(k);
      const isFirstRender = !el;
      if (isFirstRender) {
        el = createElement();
        elementsByKey.set(k, el);
        if (templateRoot) {
          bindingsByKey.set(k, collectItemBindings(el));
        }
      }
      try {
        if (isFirstRender && create) {
          const cleanup = create(item, el, i);
          if (typeof cleanup === "function") {
            cleanupByKey.set(k, cleanup);
          }
        }
        const prevItem = prevItemsByKey.get(k);
        const prevIndex = prevIndexByKey.get(k);
        if (templateRoot) {
          if (prevItem !== item || prevIndex !== i) {
            applyItemBindings(bindingsByKey.get(k), item, i);
            if (update) update(item, el, i, { isFirstRender });
          }
        } else if (update) {
          if (prevItem !== item || prevIndex !== i) {
            update(item, el, i, { isFirstRender });
          }
        } else if (render) {
          render(item, el, i);
        }
        prevItemsByKey.set(k, item);
        prevIndexByKey.set(k, i);
      } catch (err) {
        logError(`[Lume.js] repeat(): error rendering key "${k}":`, err);
      }
      nextEls.push(el);
    }
    applyPreservation(containerEl, () => {
      reconcileDOM(containerEl, nextEls);
      if (elementsByKey.size !== seenKeys.size) {
        for (const k of elementsByKey.keys()) {
          if (!seenKeys.has(k)) {
            const el = elementsByKey.get(k);
            const prevItem = prevItemsByKey.get(k);
            const cleanup = cleanupByKey.get(k);
            if (typeof cleanup === "function") {
              try {
                cleanup();
              } catch (err) {
                logError(`[Lume.js] repeat(): cleanup error for key "${k}":`, err);
              }
            }
            if (typeof remove === "function" && el) {
              remove(prevItem, el);
            }
            elementsByKey.delete(k);
            prevItemsByKey.delete(k);
            prevIndexByKey.delete(k);
            cleanupByKey.delete(k);
            bindingsByKey.delete(k);
          }
        }
      }
    }, isReorder);
  }
  let unsubscribe;
  if (typeof store.$subscribe === "function") {
    unsubscribe = store.$subscribe(arrayKey, updateList);
  } else if (typeof store.subscribe === "function") {
    const subResult = store.subscribe(() => updateList());
    updateList();
    unsubscribe = typeof subResult === "function" ? subResult : () => {
      subResult?.unsubscribe?.();
    };
  } else {
    updateList();
    logWarn("[Lume.js] repeat(): store is not reactive (no $subscribe or subscribe method)");
    return () => {
      for (const [k, el] of elementsByKey) {
        const prevItem = prevItemsByKey.get(k);
        const cleanup = cleanupByKey.get(k);
        if (typeof cleanup === "function") {
          try {
            cleanup();
          } catch (err) {
            logError(`[Lume.js] repeat(): cleanup error for key "${k}":`, err);
          }
        }
        if (typeof remove === "function") {
          remove(prevItem, el);
        }
      }
      clearContainer();
      elementsByKey.clear();
      prevItemsByKey.clear();
      prevIndexByKey.clear();
      cleanupByKey.clear();
      bindingsByKey.clear();
      seenKeys.clear();
    };
  }
  return () => {
    if (typeof unsubscribe === "function") {
      unsubscribe();
    }
    for (const [k, el] of elementsByKey) {
      const prevItem = prevItemsByKey.get(k);
      const cleanup = cleanupByKey.get(k);
      if (typeof cleanup === "function") {
        try {
          cleanup();
        } catch (err) {
          logError(`[Lume.js] repeat(): cleanup error for key "${k}":`, err);
        }
      }
      if (typeof remove === "function") {
        remove(prevItem, el);
      }
    }
    clearContainer();
    elementsByKey.clear();
    prevItemsByKey.clear();
    prevIndexByKey.clear();
    cleanupByKey.clear();
    bindingsByKey.clear();
    seenKeys.clear();
  };
}
let globalEnabled = true;
let globalFilter = null;
const stats = /* @__PURE__ */ new Map();
function matchesFilter(key) {
  if (globalFilter === null) return true;
  if (typeof globalFilter === "string") {
    return key.includes(globalFilter);
  }
  if (globalFilter instanceof RegExp) {
    return globalFilter.test(key);
  }
  return true;
}
function getStats(label) {
  if (!stats.has(label)) {
    stats.set(label, {
      gets: /* @__PURE__ */ new Map(),
      sets: /* @__PURE__ */ new Map(),
      notifies: /* @__PURE__ */ new Map()
    });
  }
  return stats.get(label);
}
function incrementStat(label, type, key) {
  const s = getStats(label);
  const map = s[type];
  map.set(key, (map.get(key) || 0) + 1);
}
const MAX_LOG_LEN = 100;
const TRUNCATED_LEN = MAX_LOG_LEN - 3;
function formatValue(value) {
  try {
    const json = JSON.stringify(value);
    if (json.length > MAX_LOG_LEN) {
      return json.slice(0, TRUNCATED_LEN) + "...";
    }
    return json;
  } catch {
    return String(value);
  }
}
function createDebugPlugin(options = {}) {
  const label = options.label ?? "store";
  const getOpt = (name, defaultVal) => {
    const val = options[name];
    return val !== void 0 ? val : defaultVal;
  };
  return {
    name: `debug:${label}`,
    onInit: () => {
      if (globalEnabled) {
        console.log(`%c[${label}]%c initialized`, "color: #888; font-weight: bold", "color: inherit");
      }
    },
    onGet: (key, value) => {
      if (typeof key === "string" && key.startsWith("$")) {
        return value;
      }
      incrementStat(label, "gets", key);
      if (globalEnabled && getOpt("logGet", false) && matchesFilter(key)) {
        console.log(
          `%c[${label}]%c GET %c${key}%c = ${formatValue(value)}`,
          "color: #888; font-weight: bold",
          "color: #4CAF50",
          "color: #2196F3; font-weight: bold",
          "color: inherit"
        );
      }
      return value;
    },
    onSet: (key, newValue, oldValue) => {
      if (typeof key === "string" && key.startsWith("$")) {
        return newValue;
      }
      incrementStat(label, "sets", key);
      if (globalEnabled && getOpt("logSet", true) && matchesFilter(key)) {
        console.log(
          `%c[${label}]%c SET %c${key}%c: ${formatValue(oldValue)} → ${formatValue(newValue)}`,
          "color: #888; font-weight: bold",
          "color: #FF9800",
          "color: #2196F3; font-weight: bold",
          "color: inherit"
        );
        if (getOpt("trace", false)) {
          console.trace(`%c[${label}] Stack trace for ${key}`, "color: #888");
        }
      }
      return newValue;
    },
    onSubscribe: (key) => {
      if (globalEnabled && matchesFilter(key)) {
        console.log(
          `%c[${label}]%c SUBSCRIBE %c${key}`,
          "color: #888; font-weight: bold",
          "color: #9C27B0",
          "color: #2196F3; font-weight: bold"
        );
      }
    },
    onNotify: (key, value) => {
      if (typeof key === "string" && key.startsWith("$")) {
        return;
      }
      incrementStat(label, "notifies", key);
      if (globalEnabled && getOpt("logNotify", true) && matchesFilter(key)) {
        console.log(
          `%c[${label}]%c NOTIFY %c${key}%c = ${formatValue(value)}`,
          "color: #888; font-weight: bold",
          "color: #E91E63",
          "color: #2196F3; font-weight: bold",
          "color: inherit"
        );
      }
    }
  };
}
const debug = {
  /**
   * Enable debug logging globally
   */
  enable() {
    globalEnabled = true;
    console.log("%c[lume-debug]%c Logging enabled", "color: #888; font-weight: bold", "color: #4CAF50");
  },
  /**
   * Disable debug logging globally
   */
  disable() {
    globalEnabled = false;
    console.log("%c[lume-debug]%c Logging disabled", "color: #888; font-weight: bold", "color: #F44336");
  },
  /**
   * Check if debug logging is currently enabled
   * @returns {boolean}
   */
  isEnabled() {
    return globalEnabled;
  },
  /**
   * Filter logs by key pattern
   * @param {string|RegExp|null} pattern - Pattern to match, or null to clear filter
   */
  filter(pattern) {
    globalFilter = pattern;
    if (pattern === null) {
      console.log("%c[lume-debug]%c Filter cleared", "color: #888; font-weight: bold", "color: inherit");
    } else {
      console.log(`%c[lume-debug]%c Filter set: ${pattern}`, "color: #888; font-weight: bold", "color: inherit");
    }
  },
  /**
   * Get current filter pattern
   * @returns {string|RegExp|null}
   */
  getFilter() {
    return globalFilter;
  },
  /**
   * Get statistics data (silent - no console output)
   * Use logStats() if you want to see stats in console.
   * @returns {object} Stats object for programmatic access
   */
  stats() {
    const result = {};
    for (const [label, data] of stats) {
      result[label] = {
        gets: Object.fromEntries(data.gets),
        sets: Object.fromEntries(data.sets),
        notifies: Object.fromEntries(data.notifies)
      };
    }
    return result;
  },
  /**
   * Log statistics summary to console (with formatting)
   * @returns {object} Stats object for programmatic access
   */
  logStats() {
    const result = this.stats();
    if (Object.keys(result).length === 0) {
      console.log("%c[lume-debug]%c No stats collected yet", "color: #888; font-weight: bold", "color: inherit");
      return result;
    }
    console.group("%c[lume-debug] Statistics", "color: #888; font-weight: bold");
    for (const [label, data] of Object.entries(result)) {
      console.group(`%c${label}`, "color: #2196F3; font-weight: bold");
      const tableData = [];
      const allKeys = /* @__PURE__ */ new Set([
        ...Object.keys(data.gets),
        ...Object.keys(data.sets),
        ...Object.keys(data.notifies)
      ]);
      for (const key of allKeys) {
        tableData.push({
          key,
          gets: data.gets[key] || 0,
          sets: data.sets[key] || 0,
          notifies: data.notifies[key] || 0
        });
      }
      if (tableData.length > 0) {
        console.table(tableData);
      }
      console.groupEnd();
    }
    console.groupEnd();
    return result;
  },
  /**
   * Reset all collected statistics
   */
  resetStats() {
    stats.clear();
    console.log("%c[lume-debug]%c Stats reset", "color: #888; font-weight: bold", "color: inherit");
  }
};
function withPlugins(store, plugins = []) {
  if (!plugins.length) return store;
  for (const p of plugins) {
    try {
      p.onInit?.();
    } catch (e) {
      logError(`[Lume.js] Plugin "${p.name}" error in onInit:`, e);
    }
    Object.freeze(p);
  }
  const pendingNotifications = /* @__PURE__ */ new Map();
  function runNotifyHooks() {
    for (const [key, value] of pendingNotifications) {
      for (const p of plugins) {
        try {
          p.onNotify?.(key, value);
        } catch (e) {
          logError(`[Lume.js] Plugin "${p.name}" error in onNotify:`, e);
        }
      }
    }
    pendingNotifications.clear();
  }
  let flushUnsub;
  if (typeof store.$beforeFlush === "function") {
    flushUnsub = store.$beforeFlush(runNotifyHooks);
  }
  return new Proxy(store, {
    get(target, key) {
      if (key === "$dispose") {
        return () => {
          if (flushUnsub) flushUnsub();
          pendingNotifications.clear();
        };
      }
      if (typeof key === "string" && key.startsWith("$")) {
        const method = target[key];
        if (key === "$subscribe" && typeof method === "function") {
          return (subKey, fn) => {
            for (const p of plugins) {
              try {
                p.onSubscribe?.(subKey);
              } catch (e) {
                logError(`[Lume.js] Plugin "${p.name}" error in onSubscribe:`, e);
              }
            }
            return method(subKey, fn);
          };
        }
        return method;
      }
      let value = target[key];
      for (const p of plugins) {
        try {
          const r = p.onGet?.(key, value);
          if (r !== void 0) value = r;
        } catch (e) {
          logError(`[Lume.js] Plugin "${p.name}" error in onGet:`, e);
        }
      }
      return value;
    },
    set(target, key, value) {
      const oldValue = target[key];
      let newValue = value;
      for (const p of plugins) {
        try {
          const r = p.onSet?.(key, newValue, oldValue);
          if (r !== void 0) newValue = r;
        } catch (e) {
          logError(`[Lume.js] Plugin "${p.name}" error in onSet:`, e);
        }
      }
      if (!Object.is(newValue, oldValue)) {
        pendingNotifications.set(key, newValue);
      }
      target[key] = newValue;
      return true;
    }
  });
}
function createCleanupGroup() {
  const cleanups = [];
  return {
    /**
     * Add a cleanup function to the group.
     * @param {Function} fn - Cleanup/unsubscribe function
     */
    add(fn) {
      if (typeof fn === "function") {
        cleanups.push(fn);
      }
    },
    /**
     * Run all collected cleanup functions and clear the group.
     */
    dispose() {
      while (cleanups.length) {
        const fn = cleanups.pop();
        try {
          fn();
        } catch (e) {
        }
      }
    }
  };
}
function hydrateState(selector = "#__LUME_DATA__", validate) {
  const el = typeof document !== "undefined" ? document.querySelector(selector) : null;
  if (!el) return {};
  if (el.tagName !== "SCRIPT" || el.type !== "application/json") {
    return {};
  }
  let data;
  try {
    data = JSON.parse(el.textContent);
  } catch {
    return {};
  }
  if (typeof validate === "function" && !validate(data)) {
    return {};
  }
  return data;
}
function readStored(storage, storageKey) {
  try {
    const raw = storage.getItem(storageKey);
    if (!raw) return null;
    const data = JSON.parse(raw);
    return data && typeof data === "object" && !Array.isArray(data) ? data : null;
  } catch {
    logWarn(`[Lume.js] persist(): could not read "${storageKey}" — starting fresh`);
    return null;
  }
}
function serializeKeys(store, watched) {
  const out = {};
  for (const k of watched) out[k] = store[k];
  return JSON.stringify(out);
}
const activeEntries = /* @__PURE__ */ new WeakMap();
function defaultStorage() {
  try {
    return typeof localStorage !== "undefined" ? localStorage : void 0;
  } catch {
    return void 0;
  }
}
function persist(store, storageKey, options = {}) {
  if (!store || typeof store.$subscribe !== "function") {
    throw new Error("[Lume.js] persist() requires a reactive store from state()");
  }
  if (typeof storageKey !== "string" || storageKey.length === 0) {
    throw new Error("[Lume.js] persist() requires a non-empty storage key");
  }
  const storage = options.storage !== void 0 ? options.storage : defaultStorage();
  if (!storage || typeof storage.getItem !== "function") {
    logWarn("[Lume.js] persist(): no storage available — persistence disabled");
    return () => {
    };
  }
  const watched = Array.isArray(options.keys) ? options.keys.slice() : Object.keys(store).filter((k) => !k.startsWith("$"));
  let entrySet = activeEntries.get(storage);
  if (!entrySet) {
    entrySet = /* @__PURE__ */ new Set();
    activeEntries.set(storage, entrySet);
  }
  const ownsEntry = !entrySet.has(storageKey);
  if (ownsEntry) {
    entrySet.add(storageKey);
  } else {
    logWarn(
      `[Lume.js] persist(): "${storageKey}" is already managed by another persist() on this storage — instances will overwrite each other's data. Use a distinct key per store.`
    );
  }
  const stored = readStored(storage, storageKey);
  if (stored) {
    for (const k of watched) {
      if (Object.prototype.hasOwnProperty.call(stored, k)) {
        store[k] = stored[k];
      }
    }
  }
  let lastWritten = null;
  try {
    lastWritten = serializeKeys(store, watched);
  } catch {
  }
  let scheduled = false;
  let disposed = false;
  const flushSave = () => {
    scheduled = false;
    if (disposed) return;
    let json;
    try {
      json = serializeKeys(store, watched);
    } catch (err) {
      logWarn("[Lume.js] persist(): state not serializable — skipping save", err);
      return;
    }
    if (json === lastWritten) return;
    try {
      storage.setItem(storageKey, json);
      lastWritten = json;
    } catch (err) {
      logWarn("[Lume.js] persist(): could not write — storage full or unavailable?", err);
    }
  };
  const save = () => {
    if (scheduled) return;
    scheduled = true;
    queueMicrotask(flushSave);
  };
  const unsubs = watched.map((k) => {
    let first = true;
    return store.$subscribe(k, () => {
      if (first) {
        first = false;
        return;
      }
      save();
    });
  });
  return () => {
    disposed = true;
    if (ownsEntry) entrySet.delete(storageKey);
    while (unsubs.length) unsubs.pop()();
  };
}
function isReactive(obj) {
  return !!(obj && typeof obj === "object" && (REACTIVE_BRAND in obj || typeof obj.$subscribe === "function"));
}
export {
  computed,
  createCleanupGroup,
  createDebugPlugin,
  debug,
  defaultFocusPreservation,
  defaultScrollPreservation,
  hydrateState,
  isReactive,
  persist,
  repeat,
  watch,
  withPlugins
};
