// Client-side HLS downloader: fetches all segments through our proxy and
// concatenates them into a single .ts file the browser can save normally.
// Works for unencrypted (or AES-128 with key URI) HLS — which is what Vidnest serves.

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

// Resolve a media playlist (no #EXT-X-STREAM-INF). If master, pick by preferred
// height (closest at-or-below); falls back to highest bandwidth when unknown.
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
    // closest height at or below target; if none below, take the smallest above
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
    try { out.push(new URL(line, baseUrl).toString()); } catch {}
  }
  return out;
}

export async function downloadHls(
  playlistUrl: string,
  filename: string,
  onProgress: (p: DLProgress) => void,
  signal?: AbortSignal,
  preferredHeight?: number,
): Promise<void> {
  const startedAt = performance.now();
  try {
    onProgress({ done: 0, total: 0, bytes: 0, status: 'parsing' });
    const { url: mediaUrl, text } = await resolveMediaPlaylist(playlistUrl, preferredHeight);
    const segments = parseSegments(text, mediaUrl);
    if (!segments.length) throw new Error('No segments found');

    const chunks: Uint8Array[] = [];
    let bytes = 0;
    const concurrency = 6;
    let next = 0;
    let done = 0;
    let failed: any = null;

    const results: Uint8Array[] = new Array(segments.length);

    async function worker() {
      while (true) {
        if (signal?.aborted) throw new Error('aborted');
        const i = next++;
        if (i >= segments.length) return;
        let attempt = 0;
        while (true) {
          try {
            const r = await fetch(segments[i], { signal });
            if (!r.ok) throw new Error(`seg ${i} ${r.status}`);
            const buf = new Uint8Array(await r.arrayBuffer());
            results[i] = buf;
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
    for (const r of results) chunks.push(r);

    const blob = new Blob(chunks as BlobPart[], { type: 'video/mp2t' });

    // Verify blob: non-empty, size matches accumulated bytes, starts with MPEG-TS sync byte 0x47
    onProgress({ done: segments.length, total: segments.length, bytes, status: 'verifying' });
    const head = new Uint8Array(await blob.slice(0, 1).arrayBuffer());
    const sizeOk = blob.size > 0 && blob.size === bytes;
    const tsOk = head[0] === 0x47;
    if (!sizeOk) throw new Error(`Blob size mismatch (${blob.size} vs ${bytes})`);
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
