// On-device persistence. The whole document (days, holidays, settings) is
// one small JSON value in IndexedDB; localStorage is the fallback when
// IndexedDB is unavailable (some private modes). Nothing leaves the device.

const DB_NAME = "rto";
const STORE = "kv";
const KEY = "doc";
const LS_KEY = "rto-doc";

function openDb() {
  return new Promise((resolve, reject) => {
    if (!("indexedDB" in globalThis)) return reject(new Error("no indexedDB"));
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

let dbPromise = null;
const getDb = () => (dbPromise ??= openDb());

export async function load() {
  try {
    const db = await getDb();
    const value = await new Promise((resolve, reject) => {
      const req = db.transaction(STORE, "readonly").objectStore(STORE).get(KEY);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    if (value) return value;
  } catch {
    /* fall through to localStorage */
  }
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export async function save(doc) {
  const plain = JSON.parse(JSON.stringify(doc));
  try {
    const db = await getDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(plain, KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
    return "indexeddb";
  } catch {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(plain));
      return "localstorage";
    } catch {
      return "failed";
    }
  }
}

export async function wipe() {
  try {
    const db = await getDb();
    await new Promise((resolve) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).delete(KEY);
      tx.oncomplete = tx.onerror = () => resolve();
    });
  } catch { /* ignore */ }
  try { localStorage.removeItem(LS_KEY); } catch { /* ignore */ }
}

// Ask the browser not to evict this origin's data under storage pressure.
export async function requestPersist() {
  try {
    if (!navigator.storage?.persist) return "unsupported";
    if (await navigator.storage.persisted()) return "granted";
    return (await navigator.storage.persist()) ? "granted" : "denied";
  } catch {
    return "unsupported";
  }
}
