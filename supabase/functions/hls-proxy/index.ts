// HLS proxy with auto-reextraction for IP-locked Vidnest CDNs.
// Modes:
//  - ?url=<abs>&ref=<ref>            → plain proxy (legacy)
//  - ?ctx=<b64>&path=<rest>&ref=...  → fetch via fresh-master prefix for ctx
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, range",
  "Access-Control-Expose-Headers": "content-length, content-range, accept-ranges",
};

function selfBase(): string {
  const supaUrl = Deno.env.get("SUPABASE_URL") ?? "";
  return `${supaUrl}/functions/v1/hls-proxy`;
}

function getPrefix(u: string): string {
  return u.replace(/\/[^\/?#]+(?:[?#].*)?$/, "");
}

// ---- ctx extraction (mirrors media-extract) ----
const ALPHABET = "RB0fpH8ZEyVLkv7c2i6MAJ5u3IKFDxlS1NTsnGaqmXYdUrtzjwObCgQP94hoeW+/=";
function decryptCipher(b64: string): string {
  const idx: Record<string, number> = {};
  for (let i = 0; i < ALPHABET.length; i++) idx[ALPHABET[i]] = i;
  const out: number[] = [];
  for (let i = 0; i < b64.length; i += 4) {
    let chunk = b64.slice(i, i + 4);
    while (chunk.length < 4) chunk += "=";
    const d = chunk.split("").map((c) => idx[c] ?? 64);
    out.push(((d[0]) << 2) | (d[1] >> 4));
    if (d[2] !== 64) out.push(((d[1] & 15) << 4) | (d[2] >> 2));
    if (d[3] !== 64) out.push(((d[2] & 3) << 6) | d[3]);
  }
  return new TextDecoder().decode(new Uint8Array(out));
}
const MOVIE_SERVERS: Record<string, string> = {
  allmovies: "https://new.vidnest.fun/allmovies/movie",
  moviebox: "https://new.vidnest.fun/moviebox/movie",
  catflix: "https://new.vidnest.fun/catflix/movie",
  flixhq: "https://new.vidnest.fun/flixhq/movie",
  vidlink: "https://new.vidnest.fun/vidlink/movie",
};
const TV_SERVERS: Record<string, string> = {
  allmovies: "https://new.vidnest.fun/allmovies/tv",
  moviebox: "https://new.vidnest.fun/moviebox/tv",
  catflix: "https://new.vidnest.fun/catflix/tv",
  flixhq: "https://new.vidnest.fun/flixhq/tv",
  vidlink: "https://new.vidnest.fun/vidlink/tv",
};

function animeEndpoint(ctx: Record<string, string>): string | null {
  if (!ctx.anilist || !ctx.episode) return null;
  const audio = ctx.audioType || "sub";
  return ctx.server === "anitaku"
    ? `https://new.vidnest.fun/anitaku/${ctx.anilist}/${ctx.episode}/${audio}/hd-2`
    : `https://new.vidnest.fun/hianime/anime/${ctx.anilist}/${ctx.episode}/${audio}`;
}

function pickAnimeSource(payload: any, server: string) {
  const sources = payload?.sources ?? payload?.multiSrc ?? [];
  if (!Array.isArray(sources) || !sources.length) return null;
  if (server === "anitaku") {
    return sources.find((s: any) => s?.server === "HD-2" && s?.url)
      ?? sources.find((s: any) => s?.quality === "HD" && s?.url)
      ?? sources.find((s: any) => s?.url || s?.file);
  }
  return sources.find((s: any) => s?.file || s?.url) ?? null;
}

async function extractStream(ctx: Record<string, string>): Promise<{ prefix: string; referer: string } | null> {
  if (ctx.type === "anime") {
    const endpoint = animeEndpoint(ctx);
    if (!endpoint) return null;
    const referer = ctx.server === "anitaku" ? "https://anitaku.to" : "https://megaplay.buzz/";
    const res = await fetch(endpoint, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:137.0) Gecko/20100101 Firefox/137.0",
        Accept: "*/*",
        Referer: "https://megaplay.buzz/",
        Origin: "https://megaplay.buzz",
      },
    });
    if (!res.ok) return null;
    const raw = await res.json();
    let payload: any = raw;
    if (raw?.encrypted && typeof raw.data === "string") {
      try { payload = JSON.parse(decryptCipher(raw.data)); } catch { return null; }
    }
    const pick = pickAnimeSource(payload, ctx.server);
    const masterUrl = pick?.file || pick?.url;
    if (!masterUrl) return null;
    try {
      const head = await fetch(masterUrl, {
        method: "GET",
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:137.0) Gecko/20100101 Firefox/137.0",
          Referer: referer,
          Origin: new URL(referer).origin,
        },
        redirect: "follow",
      });
      await head.body?.cancel();
      return { prefix: getPrefix(head.url || masterUrl), referer };
    } catch {
      return { prefix: getPrefix(masterUrl), referer };
    }
  }

  const map = ctx.type === "tv" ? TV_SERVERS : MOVIE_SERVERS;
  const base = map[ctx.server];
  if (!base) return null;
  const url = ctx.type === "tv"
    ? `${base}/${ctx.tmdb}/${ctx.season}/${ctx.episode}`
    : `${base}/${ctx.tmdb}`;
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
      Referer: "https://vidnest.fun/",
      Origin: "https://vidnest.fun",
    },
  });
  if (!res.ok) return null;
  const raw = await res.json();
  let payload: any = raw;
  if (raw?.encrypted && typeof raw.data === "string") {
    try { payload = JSON.parse(decryptCipher(raw.data)); } catch { return null; }
  }
  const candidates: any[] = [];
  if (Array.isArray(payload?.streams)) candidates.push(...payload.streams);
  if (Array.isArray(payload?.sources)) candidates.push(...payload.sources);
  if (payload?.url) candidates.push({ url: payload.url, headers: payload.headers });
  const english = candidates.find((s) => (s?.language || "").toLowerCase() === "english");
  const pick = english || candidates.find((s) => s?.url);
  if (!pick) return null;
  const referer = pick?.headers?.Referer || pick?.referer || "https://vidnest.fun/";
  const masterUrl = pick.url || pick.file;
  if (!masterUrl) return null;
  // Resolve redirects so prefix matches what we'll actually fetch from.
  try {
    const head = await fetch(masterUrl, {
      method: "GET",
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
        Referer: referer,
        Origin: new URL(referer).origin,
      },
      redirect: "follow",
    });
    await head.body?.cancel();
    return { prefix: getPrefix(head.url || masterUrl), referer };
  } catch {
    return { prefix: getPrefix(masterUrl), referer };
  }
}

// Worker-local cache: avoids re-extracting on every segment when the same
// worker handles consecutive requests.
const masterCache = new Map<string, { prefix: string; referer: string; at: number }>();
const TTL = 25_000;

async function getMaster(ctxKey: string, ctx: Record<string, string>, force = false) {
  const cached = masterCache.get(ctxKey);
  if (!force && cached && Date.now() - cached.at < TTL) return cached;
  const fresh = await extractStream(ctx);
  if (!fresh) return null;
  const entry = { ...fresh, at: Date.now() };
  masterCache.set(ctxKey, entry);
  return entry;
}

function rewritePlaylistWithCtx(
  text: string, baseUrl: string, referer: string, ctx: string, prefix: string,
): string {
  const base = new URL(baseUrl);
  const proxyBase = selfBase();
  const lines = text.split(/\r?\n/);
  const mk = (abs: string) => {
    if (abs.startsWith(prefix + "/")) {
      const rest = abs.slice(prefix.length + 1);
      return `${proxyBase}?ctx=${encodeURIComponent(ctx)}&path=${encodeURIComponent(rest)}&ref=${encodeURIComponent(referer)}`;
    }
    return `${proxyBase}?url=${encodeURIComponent(abs)}&ref=${encodeURIComponent(referer)}`;
  };
  return lines.map((line) => {
    const trimmed = line.trim();
    if (!trimmed) return line;
    if (trimmed.startsWith("#")) {
      return line.replace(/URI="([^"]+)"/g, (_m, u) => `URI="${mk(new URL(u, base).toString())}"`);
    }
    try { return mk(new URL(trimmed, base).toString()); } catch { return line; }
  }).join("\n");
}

function rewritePlaylistPlain(text: string, baseUrl: string, referer: string): string {
  const base = new URL(baseUrl);
  const proxyBase = selfBase();
  const lines = text.split(/\r?\n/);
  return lines.map((line) => {
    const trimmed = line.trim();
    if (!trimmed) return line;
    if (trimmed.startsWith("#")) {
      return line.replace(/URI="([^"]+)"/g, (_m, u) => {
        const abs = new URL(u, base).toString();
        return `URI="${proxyBase}?url=${encodeURIComponent(abs)}&ref=${encodeURIComponent(referer)}"`;
      });
    }
    try {
      const abs = new URL(trimmed, base).toString();
      return `${proxyBase}?url=${encodeURIComponent(abs)}&ref=${encodeURIComponent(referer)}`;
    } catch { return line; }
  }).join("\n");
}

async function fetchUpstream(target: string, referer: string, range: string | null) {
  const headers: Record<string, string> = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
    Referer: referer,
    Origin: new URL(referer).origin,
  };
  if (range) headers["Range"] = range;
  return await fetch(target, { headers, redirect: "follow" });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const u = new URL(req.url);
    const ctxParam = u.searchParams.get("ctx");
    const pathParam = u.searchParams.get("path");
    const directUrl = u.searchParams.get("url");
    const referer = u.searchParams.get("ref") ?? "https://vidnest.fun/";
    const range = req.headers.get("range");

    if (!ctxParam && !directUrl) {
      return new Response("missing url or ctx", { status: 400, headers: corsHeaders });
    }

    // --- CTX-driven mode: always go through cached master prefix ---
    if (ctxParam && pathParam) {
      let ctx: Record<string, string>;
      try { ctx = JSON.parse(atob(ctxParam)); }
      catch { return new Response("bad ctx", { status: 400, headers: corsHeaders }); }

      const ctxKey = ctxParam;
      let master = await getMaster(ctxKey, ctx);
      if (!master) return new Response("extract failed", { status: 502, headers: corsHeaders });

      const buildTarget = (m: { prefix: string }) => `${m.prefix}/${pathParam}`;
      let target = buildTarget(master);
      let upstream = await fetchUpstream(target, master.referer, range);

      // Token rejected (mostly 403/404) → re-extract once and retry.
      if (upstream.status === 403 || upstream.status === 404) {
        await upstream.body?.cancel();
        master = await getMaster(ctxKey, ctx, true);
        if (master) {
          target = buildTarget(master);
          upstream = await fetchUpstream(target, master.referer, range);
        }
      }

      const ctype = upstream.headers.get("content-type") ?? "";
      const isPlaylist =
        pathParam.includes(".m3u8") || ctype.includes("mpegurl") || ctype.includes("application/vnd.apple");

      const respHeaders: Record<string, string> = { ...corsHeaders };
      for (const h of ["content-type", "content-length", "content-range", "accept-ranges", "cache-control"]) {
        const v = upstream.headers.get(h);
        if (v) respHeaders[h] = v;
      }

      if (isPlaylist) {
        const text = await upstream.text();
        const rewritten = rewritePlaylistWithCtx(text, upstream.url || target, master.referer, ctxParam, master.prefix);
        respHeaders["content-type"] = "application/vnd.apple.mpegurl";
        delete respHeaders["content-length"];
        return new Response(rewritten, { status: upstream.status, headers: respHeaders });
      }

      return new Response(upstream.body, { status: upstream.status, headers: respHeaders });
    }

    // --- Legacy direct-url mode ---
    const target = directUrl!;
    const upstream = await fetchUpstream(target, referer, range);
    const ctype = upstream.headers.get("content-type") ?? "";
    const isPlaylist =
      target.includes(".m3u8") || ctype.includes("mpegurl") || ctype.includes("application/vnd.apple");

    const respHeaders: Record<string, string> = { ...corsHeaders };
    for (const h of ["content-type", "content-length", "content-range", "accept-ranges", "cache-control"]) {
      const v = upstream.headers.get(h);
      if (v) respHeaders[h] = v;
    }

    if (isPlaylist) {
      const text = await upstream.text();
      const rewritten = rewritePlaylistPlain(text, target, referer);
      respHeaders["content-type"] = "application/vnd.apple.mpegurl";
      delete respHeaders["content-length"];
      if (u.searchParams.get("dl")) {
        const safe = (u.searchParams.get("name") || "stream").replace(/[^a-z0-9_\-]+/gi, "_").slice(0, 80);
        respHeaders["content-disposition"] = `attachment; filename="${safe}.m3u8"`;
      }
      return new Response(rewritten, { status: upstream.status, headers: respHeaders });
    }

    return new Response(upstream.body, { status: upstream.status, headers: respHeaders });
  } catch (e) {
    return new Response(`proxy error: ${e}`, { status: 500, headers: corsHeaders });
  }
});
