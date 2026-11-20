import { a as logWarn, l as logError } from "./shared-DmpHYKx7.mjs";
const MAX_FLUSH_ITERATIONS = 100;
let batchDepth = 0;
const batchedStates = /* @__PURE__ */ new Set();
function enqueueIfBatching(handle) {
  if (batchDepth === 0) return false;
  batchedStates.add(handle);
  return true;
}
function flushBatchedStates() {
  let iterations = 0;
  while (batchedStates.size > 0 && iterations < MAX_FLUSH_ITERATIONS) {
    iterations++;
    const wave = Array.from(batchedStates);
    batchedStates.clear();
    const effects = /* @__PURE__ */ new Set();
    for (const s of wave) {
      s.runBeforeFlushHooks();
      s.notifySubscribers();
      for (const fx of s.takeEffects()) effects.add(fx);
    }
    for (const fx of effects) {
      try {
        fx();
      } catch (err) {
        logError("[Lume.js state] Error in effect:", err);
      }
    }
  }
  if (iterations >= MAX_FLUSH_ITERATIONS) {
    batchedStates.clear();
    logError(
      "[Lume.js state] Maximum batch flush iterations reached (100). This usually indicates an infinite loop caused by an effect or computed mutating state it depends on."
    );
  }
}
function batch(fn) {
  if (typeof fn !== "function") {
    throw new Error("batch() requires a function");
  }
  if (batchDepth > 0) return fn();
  batchDepth++;
  let result;
  try {
    result = fn();
    if (result && typeof result.then === "function") {
      logWarn(
        "[Lume.js batch] batch() received an async function. Only writes before the first await are batched; later writes flush via normal microtasks."
      );
    }
    return result;
  } finally {
    try {
      flushBatchedStates();
    } finally {
      batchDepth--;
    }
  }
}
const readers = /* @__PURE__ */ new Set();
const REACTIVE_BRAND = Symbol.for("lume.reactive");
function withReadObserver(onRead, fn) {
  readers.add(onRead);
  try {
    return fn();
  } finally {
    readers.delete(onRead);
  }
}
function state(obj) {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) {
    throw new Error("state() requires a plain object");
  }
  if (Object.isFrozen(obj) || Object.isSealed(obj)) {
    throw new Error("state() requires a mutable plain object");
  }
  const listeners = /* @__PURE__ */ Object.create(null);
  const pendingNotifications = /* @__PURE__ */ new Map();
  const pendingEffects = /* @__PURE__ */ new Set();
  const beforeFlushHooks = [];
  let flushScheduled = false;
  let listenerCount = 0;
  function runBeforeFlushHooks() {
    for (let i = 0; i < beforeFlushHooks.length; i++) {
      try {
        beforeFlushHooks[i]();
      } catch (err) {
        logError("[Lume.js state] Error in beforeFlush hook:", err);
      }
    }
  }
  function notifySubscribers() {
    if (listenerCount === 0) {
      pendingNotifications.clear();
      return;
    }
    const entries = Array.from(pendingNotifications);
    pendingNotifications.clear();
    for (const [key, value] of entries) {
      if (listeners[key]) {
        const subs = listeners[key];
        let i = 0;
        while (i < subs.length) {
          const fn = subs[i];
          try {
            fn(value);
          } catch (err) {
            logError(`[Lume.js state] Error notifying subscriber for key "${String(key)}":`, err);
          }
          if (subs[i] === fn) i++;
        }
      }
    }
  }
  function takeEffects() {
    const effects = Array.from(pendingEffects);
    pendingEffects.clear();
    return effects;
  }
  const batchHandle = { runBeforeFlushHooks, notifySubscribers, takeEffects };
  function scheduleFlush() {
    if (enqueueIfBatching(batchHandle)) return;
    if (flushScheduled) return;
    flushScheduled = true;
    queueMicrotask(() => {
      let iterations = 0;
      try {
        while ((pendingNotifications.size > 0 || pendingEffects.size > 0) && iterations < MAX_FLUSH_ITERATIONS) {
          iterations++;
          runBeforeFlushHooks();
          notifySubscribers();
          const effects = takeEffects();
          for (let i = 0; i < effects.length; i++) {
            try {
              effects[i]();
            } catch (err) {
              logError("[Lume.js state] Error in effect:", err);
            }
          }
        }
      } finally {
        flushScheduled = false;
      }
      if (iterations >= MAX_FLUSH_ITERATIONS) {
        logError(
          "[Lume.js state] Maximum flush iterations reached (100). This usually indicates an infinite loop caused by an effect or computed mutating state it depends on."
        );
      }
    });
  }
  Object.defineProperty(obj, REACTIVE_BRAND, { value: true });
  const MAX_SUBSCRIBERS = 1e3;
  const noopUnsubscribe = () => {
  };
  function addListener(key, fn, kind) {
    if (!listeners[key]) listeners[key] = [];
    if (listeners[key].length >= MAX_SUBSCRIBERS) {
      logError(
        `[Lume.js state] Subscriber limit (${MAX_SUBSCRIBERS}) reached for key "${String(key)}". ${kind} ignored — it will NOT receive updates. This usually means subscriptions are created in a loop without cleanup.`
      );
      return noopUnsubscribe;
    }
    listeners[key].push(fn);
    listenerCount++;
    return () => {
      if (listeners[key]) {
        const idx = listeners[key].indexOf(fn);
        if (idx !== -1) {
          listeners[key].splice(idx, 1);
          listenerCount--;
          if (listeners[key].length === 0) delete listeners[key];
        }
      }
    };
  }
  const registerEffect = (key, executeFn) => {
    const callback = () => {
      pendingEffects.add(executeFn);
    };
    return addListener(key, callback, "Effect subscription");
  };
  const BLOCKED_KEYS = /* @__PURE__ */ new Set(["__proto__", "constructor", "prototype"]);
  const proxy = new Proxy(obj, {
    get(target, key) {
      if (typeof key === "string" && key.startsWith("$")) {
        return target[key];
      }
      const value = target[key];
      if (readers.size > 0) {
        for (const reader of readers) {
          reader(proxy, key, registerEffect);
        }
      }
      return value;
    },
    set(target, key, value) {
      if (typeof key === "string" && BLOCKED_KEYS.has(key)) {
        logWarn(`[Lume.js state] Blocked write to reserved key "${key}"`);
        return true;
      }
      const oldValue = target[key];
      if (Object.is(oldValue, value)) return true;
      target[key] = value;
      if (listenerCount === 0 && beforeFlushHooks.length === 0) return true;
      pendingNotifications.set(key, value);
      scheduleFlush();
      return true;
    }
  });
  obj.$beforeFlush = (fn) => {
    if (typeof fn !== "function") {
      throw new Error("$beforeFlush requires a function");
    }
    if (beforeFlushHooks.indexOf(fn) === -1) {
      beforeFlushHooks.push(fn);
    }
    return () => {
      const idx = beforeFlushHooks.indexOf(fn);
      if (idx !== -1) {
        beforeFlushHooks.splice(idx, 1);
      }
    };
  };
  obj.$subscribe = (key, fn) => {
    if (typeof fn !== "function") {
      throw new Error("Subscriber must be a function");
    }
    const unsubscribe = addListener(key, fn, "New subscriber");
    if (unsubscribe === noopUnsubscribe) return unsubscribe;
    fn(proxy[key]);
    return unsubscribe;
  };
  return proxy;
}
export {
  REACTIVE_BRAND as R,
  batch as b,
  state as s,
  withReadObserver as w
};
