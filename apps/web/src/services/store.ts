/** Minimal IndexedDB key-value store (per-origin, this browser only). */
const DB = 'tandem';
const STORE = 'kv';

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

export async function kvGet<T>(key: string, fallback: T): Promise<T> {
  try {
    const db = await open();
    return await new Promise<T>(res => {
      const q = db.transaction(STORE).objectStore(STORE).get(key);
      q.onsuccess = () => res((q.result as T) ?? fallback);
      q.onerror = () => res(fallback);
    });
  } catch { return fallback; }
}

export async function kvSet(key: string, value: unknown): Promise<void> {
  try {
    const db = await open();
    await new Promise<void>(res => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(value, key);
      tx.oncomplete = () => res();
      tx.onerror = () => res();
    });
  } catch { /* storage unavailable: app still works in memory */ }
}
