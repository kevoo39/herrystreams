// Streams an MP4 through our mp4-proxy with ranged requests. Each chunk is
// persisted to IndexedDB as it arrives so a reload or crash can resume from
// the next missing chunk instead of restarting at zero.

import {
  putChunk, hasChunk, listChunkIndexes, getAllChunksOrdered,
  totalBytesFor, setMeta, getMeta, clearJob, requestPersistence,
} from '@/lib/downloadStore';

export type MP4Progress = {
  bytes: number;
  total: number;
  status: 'starting' | 'downloading' | 'finalizing' | 'done' | 'error';
  message?: string;
  filename?: string;
  durationMs?: number;
};

const CHUNK = 4 * 1024 * 1024; // 4MB ranged chunks
const MAX_RETRIES = 4;

async function headContentLength(url: string, signal?: AbortSignal): Promise<number> {
  try {
    const r = await fetch(url, { method: 'HEAD', signal });
    const len = r.headers.get('content-length');
    if (len && r.ok) return parseInt(len, 10) || 0;
  } catch { /* fall through */ }
  return 0;
}

async function fetchRange(
  url: string, start: number, end: number, signal?: AbortSignal,
): Promise<Uint8Array> {
  let attempt = 0;
  while (true) {
    try {
      const r = await fetch(url, {
        headers: { Range: `bytes=${start}-${end}` },
        signal,
      });
      if (!r.ok && r.status !== 206 && r.status !== 200) {
        throw new Error(`HTTP ${r.status}`);
      }
      return new Uint8Array(await r.arrayBuffer());
    } catch (e) {
      if (signal?.aborted) throw e;
      if (++attempt > MAX_RETRIES) throw e;
      await new Promise((r) => setTimeout(r, 500 * attempt * attempt));
    }
  }
}

export async function downloadMp4(
  url: string,
  filename: string,
  onProgress: (p: MP4Progress) => void,
  signal?: AbortSignal,
  jobId?: string,
): Promise<void> {
  const startedAt = performance.now();
  const persist = !!jobId;
  try {
    onProgress({ bytes: 0, total: 0, status: 'starting' });
    if (persist) await requestPersistence();

    const total = await headContentLength(url, signal);

    // Resume: existing chunks + prior meta
    const prior = persist ? await getMeta(jobId!) : undefined;
    const chunkSize = prior?.chunkSize ?? CHUNK;
    const totalChunks = total > 0 ? Math.ceil(total / chunkSize) : 0;
    if (persist) {
      await setMeta(jobId!, {
        kind: 'mp4', totalBytes: total, chunkSize, totalChunks, updatedAt: Date.now(),
      });
    }

    const chunks: Uint8Array[] = [];
    let bytes = persist ? await totalBytesFor(jobId!) : 0;

    if (total > 0) {
      for (let i = 0; i < totalChunks; i++) {
        if (signal?.aborted) throw new Error('aborted');
        const start = i * chunkSize;
        const end = Math.min(start + chunkSize - 1, total - 1);
        if (persist && (await hasChunk(jobId!, i))) {
          onProgress({ bytes, total, status: 'downloading' });
          continue;
        }
        const buf = await fetchRange(url, start, end, signal);
        if (persist) await putChunk(jobId!, i, buf);
        else chunks.push(buf);
        bytes += buf.byteLength;
        onProgress({ bytes, total, status: 'downloading' });
      }
    } else {
      // Unknown size — cannot safely resume ranged; stream whole body once.
      const r = await fetch(url, { signal });
      if (!r.ok || !r.body) throw new Error(`HTTP ${r.status}`);
      const reader = r.body.getReader();
      let idx = 0;
      bytes = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          if (persist) await putChunk(jobId!, idx++, value);
          else chunks.push(value);
          bytes += value.byteLength;
          onProgress({ bytes, total: 0, status: 'downloading' });
        }
      }
    }

    onProgress({ bytes, total, status: 'finalizing' });
    const finalChunks = persist ? await getAllChunksOrdered(jobId!) : chunks;
    const blob = new Blob(finalChunks as BlobPart[], { type: 'video/mp4' });
    const safe = filename.replace(/[^a-z0-9_\-]+/gi, '_').slice(0, 80) || 'video';
    const finalName = `${safe}.mp4`;
    const a = document.createElement('a');
    const objUrl = URL.createObjectURL(blob);
    a.href = objUrl;
    a.download = finalName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(objUrl), 60_000);

    if (persist) await clearJob(jobId!);

    onProgress({
      bytes, total: total || bytes, status: 'done',
      filename: finalName, durationMs: Math.round(performance.now() - startedAt),
    });
  } catch (e: any) {
    onProgress({
      bytes: 0, total: 0, status: 'error',
      message: e?.message || String(e),
      durationMs: Math.round(performance.now() - startedAt),
    });
    throw e;
  }
}
