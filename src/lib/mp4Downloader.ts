// Streams an MP4 through our mp4-proxy with resumable chunked ranged
// requests so downloads survive brief network hiccups. Reports progress
// via a callback and saves the assembled Blob with a friendly filename.

export type MP4Progress = {
  bytes: number;
  total: number;
  status: 'starting' | 'downloading' | 'finalizing' | 'done' | 'error';
  message?: string;
  filename?: string;
  durationMs?: number;
};

const CHUNK = 4 * 1024 * 1024; // 4MB ranged chunks — small enough to retry cheaply
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
): Promise<void> {
  const startedAt = performance.now();
  try {
    onProgress({ bytes: 0, total: 0, status: 'starting' });
    const total = await headContentLength(url, signal);
    const chunks: Uint8Array[] = [];
    let bytes = 0;

    if (total > 0) {
      let offset = 0;
      while (offset < total) {
        if (signal?.aborted) throw new Error('aborted');
        const end = Math.min(offset + CHUNK - 1, total - 1);
        const buf = await fetchRange(url, offset, end, signal);
        chunks.push(buf);
        bytes += buf.byteLength;
        offset = end + 1;
        onProgress({ bytes, total, status: 'downloading' });
      }
    } else {
      // Unknown size — stream the whole body with progress from the reader.
      const r = await fetch(url, { signal });
      if (!r.ok || !r.body) throw new Error(`HTTP ${r.status}`);
      const reader = r.body.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          chunks.push(value);
          bytes += value.byteLength;
          onProgress({ bytes, total: 0, status: 'downloading' });
        }
      }
    }

    onProgress({ bytes, total, status: 'finalizing' });
    const blob = new Blob(chunks as BlobPart[], { type: 'video/mp4' });
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
