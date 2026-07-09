// Client-side HLS downloader: fetches all segments through our proxy and
// concatenates them into a single .ts file. Each segment is persisted to
// IndexedDB as soon as it's fetched so a reload or crash resumes from the
// next missing segment instead of restarting.

import {
  putChunk, hasChunk, listChunkIndexes, getAllChunksOrdered,
  totalBytesFor, setMeta, clearJob, requestPersistence,
} from '@/lib/downloadStore';

export type DLProgress = {
  done: number;
  total: number;
  bytes: number;
  status: 'parsing' | 'downloading' | 'finalizing' | 'verifying' | 'done' | 'error';
  message?: string;
  filename?: string;
  durationMs?: number;
  blobSize?: number;
  verified?: boolean;
};

async function fetchText(url: string): Promise<string> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`playlist ${r.status}`);
  return r.text();
}

async function resolveMediaPlaylist(
  url: string,
  preferredHeight?: number,
): Promise<{ url: string; text: string }> {
  const text = await fetchText(url);
  if (!text.includes('#EXT-X-STREAM-INF')) return { url, text };
  const lines = text.split(/\r?\n/);
  const variants: { bw: number; h: number; uri: string }[] = [];
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (l.startsWith('#EXT-X-STREAM-INF')) {
      const bwM = /BANDWIDTH=(\d+)/.exec(l);
      const resM = /RESOLUTION=\d+x(\d+)/i.exec(l);
      const uri = (lines[i + 1] || '').trim();
      if (uri) variants.push({ bw: bwM ? +bwM[1] : 0, h: resM ? +resM[1] : 0, uri });
    }
  }
  if (!variants.length) throw new Error('No variant in master playlist');
  let pick = variants[0];
  if (preferredHeight && variants.some((v) => v.h > 0)) {
    const withH = variants.filter((v) => v.h > 0).sort((a, b) => a.h - b.h);
    const below = withH.filter((v) => v.h <= preferredHeight).pop();
    pick = below || withH[0];
  } else {
    pick = [...variants].sort((a, b) => b.bw - a.bw)[0];
  }
  const abs = new URL(pick.uri, url).toString();
  return resolveMediaPlaylist(abs);
}

function parseSegments(text: string, baseUrl: string): string[] {
  const out: string[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    try { out.push(new URL(line, baseUrl).toString()); } catch { /* skip */ }
  }
  return out;
}

export async function downloadHls(
  playlistUrl: string,
  filename: string,
  onProgress: (p: DLProgress) => void,
  signal?: AbortSignal,
  preferredHeight?: number,
  jobId?: string,
): Promise<void> {
  const startedAt = performance.now();
  const persist = !!jobId;
  try {
    onProgress({ done: 0, total: 0, bytes: 0, status: 'parsing' });
    if (persist) await requestPersistence();

    const { url: mediaUrl, text } = await resolveMediaPlaylist(playlistUrl, preferredHeight);
    const segments = parseSegments(text, mediaUrl);
    if (!segments.length) throw new Error('No segments found');

    if (persist) {
      await setMeta(jobId!, {
        kind: 'hls', totalChunks: segments.length, updatedAt: Date.now(),
      });
    }

    // Prime with existing progress
    const existingIdx = persist ? new Set(await listChunkIndexes(jobId!)) : new Set<number>();
    let bytes = persist ? await totalBytesFor(jobId!) : 0;
    let done = existingIdx.size;
    onProgress({ done, total: segments.length, bytes, status: 'downloading' });

    const concurrency = 6;
    let next = 0;
    let failed: any = null;

    // For in-memory (non-persistent) path only
    const memChunks: Uint8Array[] = new Array(segments.length);

    async function worker() {
      while (true) {
        if (signal?.aborted) throw new Error('aborted');
        const i = next++;
        if (i >= segments.length) return;
        if (persist && existingIdx.has(i)) continue;
        let attempt = 0;
        while (true) {
          try {
            const r = await fetch(segments[i], { signal });
            if (!r.ok) throw new Error(`seg ${i} ${r.status}`);
            const buf = new Uint8Array(await r.arrayBuffer());
            if (persist) await putChunk(jobId!, i, buf);
            else memChunks[i] = buf;
            bytes += buf.byteLength;
            done++;
            onProgress({ done, total: segments.length, bytes, status: 'downloading' });
            break;
          } catch (e) {
            if (signal?.aborted) throw e;
            if (++attempt >= 3) throw e;
            await new Promise((r) => setTimeout(r, 500 * attempt));
          }
        }
      }
    }

    await Promise.all(Array.from({ length: concurrency }, () => worker().catch((e) => { failed = e; })));
    if (failed) throw failed;

    onProgress({ done: segments.length, total: segments.length, bytes, status: 'finalizing' });
    const finalChunks = persist ? await getAllChunksOrdered(jobId!) : memChunks;
    const blob = new Blob(finalChunks as BlobPart[], { type: 'video/mp2t' });

    onProgress({ done: segments.length, total: segments.length, bytes, status: 'verifying' });
    const head = new Uint8Array(await blob.slice(0, 1).arrayBuffer());
    const tsOk = head[0] === 0x47;
    if (blob.size === 0) throw new Error('Empty blob');
    if (!tsOk) throw new Error('Invalid MPEG-TS header (first byte not 0x47)');

    const safe = filename.replace(/[^a-z0-9_\-]+/gi, '_').slice(0, 80) || 'video';
    const finalName = `${safe}.ts`;
    const a = document.createElement('a');
    const objUrl = URL.createObjectURL(blob);
    a.href = objUrl;
    a.download = finalName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(objUrl), 60_000);

    if (persist) await clearJob(jobId!);

    const durationMs = Math.round(performance.now() - startedAt);
    onProgress({
      done: segments.length, total: segments.length, bytes, status: 'done',
      filename: finalName, durationMs, blobSize: blob.size, verified: true,
    });
  } catch (e: any) {
    onProgress({
      done: 0, total: 0, bytes: 0, status: 'error',
      message: e?.message || String(e),
      durationMs: Math.round(performance.now() - startedAt),
      verified: false,
    });
    throw e;
  }
}
