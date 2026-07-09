// IndexedDB-backed store for partial download chunks so downloads survive
// tab reloads and crashes. Chunks are keyed by `${jobId}::${index}` (mp4
// ranged blocks or HLS segment indexes). Meta stores the total count so a
// resumed run knows what to fetch and what to skip.

const DB_NAME = 'kevnest-dl';
const DB_VERSION = 1;
const STORE_CHUNKS = 'chunks';
const STORE_META = 'meta';

export type ChunkMeta = {
  kind: 'mp4' | 'hls';
  totalBytes?: number;     // mp4: content-length
  chunkSize?: number;      // mp4: ranged chunk size in bytes
  totalChunks?: number;    // mp4 chunk count OR hls segment count
  updatedAt: number;
};

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_CHUNKS)) db.createObjectStore(STORE_CHUNKS);
      if (!db.objectStoreNames.contains(STORE_META)) db.createObjectStore(STORE_META);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('idb blocked'));
  });
  return dbPromise;
}

function tx(db: IDBDatabase, store: string, mode: IDBTransactionMode) {
  return db.transaction(store, mode).objectStore(store);
}

function req<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

const chunkKey = (jobId: string, index: number) => `${jobId}::${index.toString().padStart(6, '0')}`;

export async function putChunk(jobId: string, index: number, buf: Uint8Array): Promise<void> {
  try {
    const db = await openDb();
    // Store as a Blob so IDB can persist very large buffers efficiently
    await req(tx(db, STORE_CHUNKS, 'readwrite').put(new Blob([buf as BlobPart]), chunkKey(jobId, index)));
  } catch { /* out of quota etc — best effort */ }
}

export async function hasChunk(jobId: string, index: number): Promise<boolean> {
  try {
    const db = await openDb();
    const key = await req(tx(db, STORE_CHUNKS, 'readonly').getKey(chunkKey(jobId, index)));
    return key !== undefined;
  } catch { return false; }
}

export async function listChunkIndexes(jobId: string): Promise<number[]> {
  try {
    const db = await openDb();
    const store = tx(db, STORE_CHUNKS, 'readonly');
    const range = IDBKeyRange.bound(`${jobId}::`, `${jobId}::\uffff`);
    const keys = await req(store.getAllKeys(range) as IDBRequest<IDBValidKey[]>);
    return (keys as string[])
      .map((k) => parseInt(k.split('::')[1], 10))
      .filter((n) => Number.isFinite(n))
      .sort((a, b) => a - b);
  } catch { return []; }
}

export async function getChunk(jobId: string, index: number): Promise<Uint8Array | undefined> {
  try {
    const db = await openDb();
    const v = await req(tx(db, STORE_CHUNKS, 'readonly').get(chunkKey(jobId, index))) as Blob | Uint8Array | undefined;
    if (!v) return undefined;
    if (v instanceof Blob) return new Uint8Array(await v.arrayBuffer());
    return v;
  } catch { return undefined; }
}

export async function getAllChunksOrdered(jobId: string): Promise<Uint8Array[]> {
  const indexes = await listChunkIndexes(jobId);
  const out: Uint8Array[] = [];
  for (const i of indexes) {
    const c = await getChunk(jobId, i);
    if (c) out.push(c);
  }
  return out;
}

export async function totalBytesFor(jobId: string): Promise<number> {
  const indexes = await listChunkIndexes(jobId);
  let bytes = 0;
  try {
    const db = await openDb();
    const store = tx(db, STORE_CHUNKS, 'readonly');
    for (const i of indexes) {
      const v = await req(store.get(chunkKey(jobId, i))) as Blob | Uint8Array | undefined;
      if (!v) continue;
      bytes += v instanceof Blob ? v.size : v.byteLength;
    }
  } catch { /* noop */ }
  return bytes;
}

export async function setMeta(jobId: string, meta: ChunkMeta): Promise<void> {
  try {
    const db = await openDb();
    await req(tx(db, STORE_META, 'readwrite').put(meta, jobId));
  } catch { /* noop */ }
}

export async function getMeta(jobId: string): Promise<ChunkMeta | undefined> {
  try {
    const db = await openDb();
    return await req(tx(db, STORE_META, 'readonly').get(jobId)) as ChunkMeta | undefined;
  } catch { return undefined; }
}

export async function clearJob(jobId: string): Promise<void> {
  try {
    const db = await openDb();
    const store = tx(db, STORE_CHUNKS, 'readwrite');
    const range = IDBKeyRange.bound(`${jobId}::`, `${jobId}::\uffff`);
    await req(store.delete(range));
    await req(tx(db, STORE_META, 'readwrite').delete(jobId));
  } catch { /* noop */ }
}

// Best-effort: request persistent storage so the browser doesn't evict our
// partial chunks under storage pressure.
export async function requestPersistence(): Promise<void> {
  try {
    if (navigator.storage?.persist) await navigator.storage.persist();
  } catch { /* noop */ }
}
