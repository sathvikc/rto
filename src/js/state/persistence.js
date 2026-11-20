/**
 * On-device persistence. The whole document is one small JSON value in
 * IndexedDB, with localStorage as the fallback when IndexedDB is
 * unavailable (some private modes). Nothing leaves the device.
 */

const DB_NAME = "rto";
const DB_VERSION = 1;
const STORE_NAME = "kv";
const DOC_KEY = "doc";
const FALLBACK_KEY = "rto-doc";

/** @typedef {"indexeddb" | "localstorage" | "failed"} SaveTarget */
/** @typedef {"granted" | "denied" | "unsupported"} PersistState */

/** @type {Promise<IDBDatabase> | null} */
let dbPromise = null;

/** @returns {Promise<IDBDatabase>} */
function openDb() {
  dbPromise ??= new Promise((resolve, reject) => {
    if (!("indexedDB" in globalThis)) {
      reject(new Error("IndexedDB is unavailable"));

      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => request.result.createObjectStore(STORE_NAME);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

  return dbPromise;
}

/**
 * @template T
 * @param {IDBTransactionMode} mode
 * @param {(store: IDBObjectStore) => IDBRequest<T>} run
 * @returns {Promise<T>}
 */
async function withStore(mode, run) {
  const db = await openDb();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, mode);
    const request = run(tx.objectStore(STORE_NAME));

    tx.oncomplete = () => resolve(request.result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

/** @returns {Promise<unknown>} the saved document, or null */
export async function loadDocument() {
  try {
    const value = await withStore("readonly", (store) => store.get(DOC_KEY));

    if (value) return value;
  } catch {
    // Fall through to localStorage.
  }

  try {
    const raw = localStorage.getItem(FALLBACK_KEY);

    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/**
 * @param {object} doc
 * @returns {Promise<SaveTarget>}
 */
export async function saveDocument(doc) {
  const plain = JSON.parse(JSON.stringify(doc));

  try {
    await withStore("readwrite", (store) => store.put(plain, DOC_KEY));

    return "indexeddb";
  } catch {
    try {
      localStorage.setItem(FALLBACK_KEY, JSON.stringify(plain));

      return "localstorage";
    } catch {
      return "failed";
    }
  }
}

export async function deleteDocument() {
  try {
    await withStore("readwrite", (store) => store.delete(DOC_KEY));
  } catch {
    // Nothing stored in IndexedDB.
  }

  try {
    localStorage.removeItem(FALLBACK_KEY);
  } catch {
    // Storage blocked.
  }
}

/**
 * Ask the browser not to evict this origin's data under storage pressure.
 * @returns {Promise<PersistState>}
 */
export async function requestPersistence() {
  try {
    if (!navigator.storage?.persist) return "unsupported";
    if (await navigator.storage.persisted()) return "granted";

    return (await navigator.storage.persist()) ? "granted" : "denied";
  } catch {
    return "unsupported";
  }
}
