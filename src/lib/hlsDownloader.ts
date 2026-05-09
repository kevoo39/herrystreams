// Client-side HLS downloader: fetches all segments through our proxy and
// concatenates them into a single .ts file the browser can save normally.
// Works for unencrypted (or AES-128 with key URI) HLS — which is what Vidnest serves.

export type DLProgress = {
  done: number;
  total: number;
  bytes: number;
  status: 'parsing' | 'downloading' | 'finalizing' | 'done' | 'error';
  message?: string;
};

async function fetchText(url: string): Promise<string> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`playlist ${r.status}`);
  return r.text();
}

// Resolve a media playlist (no #EXT-X-STREAM-INF). If master, pick highest bandwidth.
async function resolveMediaPlaylist(url: string): Promise<{ url: string; text: string }> {
  const text = await fetchText(url);
  if (!text.includes('#EXT-X-STREAM-INF')) return { url, text };
  const lines = text.split(/\r?\n/);
  let bestBw = -1;
  let bestUri = '';
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (l.startsWith('#EXT-X-STREAM-INF')) {
      const m = /BANDWIDTH=(\d+)/.exec(l);
      const bw = m ? parseInt(m[1], 10) : 0;
      const uri = (lines[i + 1] || '').trim();
      if (uri && bw > bestBw) { bestBw = bw; bestUri = uri; }
    }
  }
  if (!bestUri) throw new Error('No variant in master playlist');
  const abs = new URL(bestUri, url).toString();
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
): Promise<void> {
  try {
    onProgress({ done: 0, total: 0, bytes: 0, status: 'parsing' });
    const { url: mediaUrl, text } = await resolveMediaPlaylist(playlistUrl);
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

    const blob = new Blob(chunks, { type: 'video/mp2t' });
    const a = document.createElement('a');
    const objUrl = URL.createObjectURL(blob);
    a.href = objUrl;
    const safe = filename.replace(/[^a-z0-9_\-]+/gi, '_').slice(0, 80) || 'video';
    a.download = `${safe}.ts`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(objUrl), 60_000);

    onProgress({ done: segments.length, total: segments.length, bytes, status: 'done' });
  } catch (e: any) {
    onProgress({ done: 0, total: 0, bytes: 0, status: 'error', message: e?.message || String(e) });
    throw e;
  }
}
