// Offline library: stores the final downloaded blob per job so it can be
// played back inside the app without re-downloading. Keyed by the same id
// used by downloadQueue + downloads history so lookups are trivial.

const DB_NAME = 'kevnest-offline';
const DB_VERSION = 1;
const STORE = 'files';

export type OfflineFile = {
  id: string;
  blob: Blob;
  mime: string;
  filename: string;
  bytes: number;
  savedAt: number;
};

let dbp: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbp) return dbp;
  dbp = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbp;
}

function pr<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

export async function saveOfflineBlob(
  id: string, blob: Blob, filename: string,
): Promise<void> {
  try {
    const db = await openDb();
    const file: OfflineFile = {
      id, blob, mime: blob.type || 'application/octet-stream',
      filename, bytes: blob.size, savedAt: Date.now(),
    };
    await pr(db.transaction(STORE, 'readwrite').objectStore(STORE).put(file, id));
    try { window.dispatchEvent(new CustomEvent('kevnest-offline-changed')); } catch { /* noop */ }
  } catch { /* quota / unavailable — degrade to browser-only download */ }
}

export async function getOfflineFile(id: string): Promise<OfflineFile | undefined> {
  try {
    const db = await openDb();
    return await pr(db.transaction(STORE, 'readonly').objectStore(STORE).get(id)) as OfflineFile | undefined;
  } catch { return undefined; }
}

export async function hasOfflineFile(id: string): Promise<boolean> {
  try {
    const db = await openDb();
    const key = await pr(db.transaction(STORE, 'readonly').objectStore(STORE).getKey(id));
    return key !== undefined;
  } catch { return false; }
}

export async function listOfflineIds(): Promise<string[]> {
  try {
    const db = await openDb();
    const keys = await pr(db.transaction(STORE, 'readonly').objectStore(STORE).getAllKeys());
    return keys as string[];
  } catch { return []; }
}

export async function deleteOfflineFile(id: string): Promise<void> {
  try {
    const db = await openDb();
    await pr(db.transaction(STORE, 'readwrite').objectStore(STORE).delete(id));
    try { window.dispatchEvent(new CustomEvent('kevnest-offline-changed')); } catch { /* noop */ }
  } catch { /* noop */ }
}
