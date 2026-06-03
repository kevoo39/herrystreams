// Extracts the underlying .m3u8 stream URL for movies & TV shows from new.vidnest.fun
// Query: ?type=movie&tmdb=27205&server=allmovies
//        ?type=tv&tmdb=1399&season=1&episode=1&server=allmovies
const ALPHABET = "RB0fpH8ZEyVLkv7c2i6MAJ5u3IKFDxlS1NTsnGaqmXYdUrtzjwObCgQP94hoeW+/=";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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

const SERVER_ORDER = ["allmovies", "moviebox", "catflix", "flixhq", "vidlink"];

async function fetchServer(url: string) {
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
      Referer: "https://vidnest.fun/",
      Origin: "https://vidnest.fun",
    },
  });
  if (!res.ok) throw new Error(`upstream ${res.status}`);
  const raw = await res.json();
  let payload: any = raw;
  if (raw?.encrypted && typeof raw.data === "string") {
    const decoded = decryptCipher(raw.data);
    try { payload = JSON.parse(decoded); } catch { payload = { raw: decoded }; }
  }
  return payload;
}

function pickStream(payload: any): { url: string; referer: string; language?: string } | null {
  const candidates: any[] = [];
  if (Array.isArray(payload?.streams)) candidates.push(...payload.streams);
  if (Array.isArray(payload?.sources)) candidates.push(...payload.sources);
  if (payload?.url) candidates.push({ url: payload.url, headers: payload.headers });
  const english = candidates.find((s) => (s?.language || "").toLowerCase() === "english");
  const pick = english || candidates.find((s) => s?.url);
  if (!pick) return null;
  const referer = pick?.headers?.Referer || pick?.referer || "https://vidnest.fun/";
  const url = pick.url || pick.file;
  if (!url) return null;
  return { url, referer, language: pick.language };
}

// Strip the last path segment to get the "master prefix" used for IP-locked CDNs.
function getPrefix(u: string): string {
  return u.replace(/\/[^\/?#]+(?:[?#].*)?$/, "");
}

// Rewrite playlist lines, mapping URLs that share the master prefix into
// ctx+path proxy URLs (so hls-proxy can re-mint the token), and falling back
// to plain url proxy URLs otherwise.
function rewritePlaylist(
  text: string,
  baseUrl: string,
  referer: string,
  proxyBase: string,
  ctx: string,
  prefix: string,
): string {
  const base = new URL(baseUrl);
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
      return line.replace(/URI="([^"]+)"/g, (_m, u) => {
        const abs = new URL(u, base).toString();
        return `URI="${mk(abs)}"`;
      });
    }
    try {
      const abs = new URL(trimmed, base).toString();
      return mk(abs);
    } catch { return line; }
  }).join("\n");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const u = new URL(req.url);
    const type = (u.searchParams.get("type") ?? "movie").toLowerCase();
    const tmdb = u.searchParams.get("tmdb");
    const season = u.searchParams.get("season");
    const episode = u.searchParams.get("episode");
    const requestedServer = (u.searchParams.get("server") ?? "").toLowerCase();
    const inline = u.searchParams.get("inline") === "1";

    if (!tmdb) {
      return new Response(JSON.stringify({ error: "missing tmdb" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (type === "tv" && (!season || !episode)) {
      return new Response(JSON.stringify({ error: "missing season/episode" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const order = requestedServer && SERVER_ORDER.includes(requestedServer)
      ? [requestedServer, ...SERVER_ORDER.filter((s) => s !== requestedServer)]
      : SERVER_ORDER;

    const errors: Record<string, string> = {};
    for (const server of order) {
      try {
        const base = type === "tv" ? TV_SERVERS[server] : MOVIE_SERVERS[server];
        const url = type === "tv" ? `${base}/${tmdb}/${season}/${episode}` : `${base}/${tmdb}`;
        const payload = await fetchServer(url);
        const stream = pickStream(payload);
        if (!stream) { errors[server] = "no stream"; continue; }

        if (inline) {
          const supaUrl = Deno.env.get("SUPABASE_URL") ?? "";
          const proxyBase = `${supaUrl}/functions/v1/hls-proxy`;
          // Retry master fetch a few times — Deno fetch may use a different
          // egress IP than the vidnest API call, which causes the IP-locked
          // token to be rejected. Re-extract on each retry to get a fresh URL.
          let upstream: Response | null = null;
          let activeStream = stream;
          for (let attempt = 0; attempt < 3; attempt++) {
            upstream = await fetch(activeStream.url, {
              headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
                Referer: activeStream.referer,
                Origin: new URL(activeStream.referer).origin,
              },
              redirect: "follow",
            });
            if (upstream.ok) break;
            await upstream.body?.cancel();
            // Re-extract fresh URL bound to (hopefully) the next outbound IP
            try {
              const refreshed = await fetchServer(url);
              const picked = pickStream(refreshed);
              if (picked) activeStream = picked;
            } catch { /* keep prior stream */ }
          }
          if (!upstream || !upstream.ok) { errors[server] = `playlist ${upstream?.status ?? "?"}`; continue; }
          const text = await upstream.text();
          const resolvedUrl = upstream.url || stream.url;
          const prefix = getPrefix(resolvedUrl);
          // ctx the proxy uses to re-extract & rebuild prefixes on token rejection
          const ctxObj: Record<string, string> = { type, tmdb, server };
          if (type === "tv") { ctxObj.season = season!; ctxObj.episode = episode!; }
          const ctx = btoa(JSON.stringify(ctxObj));
          const rewritten = rewritePlaylist(text, resolvedUrl, stream.referer, proxyBase, ctx, prefix);
          const headers: Record<string, string> = {
            ...corsHeaders,
            "Content-Type": "application/vnd.apple.mpegurl",
            "X-Stream-Server": server,
            "X-Stream-Referer": stream.referer,
            "X-Stream-Prefix": prefix,
          };
          if (u.searchParams.get("dl") === "1") {
            const safe = (u.searchParams.get("name") || "stream").replace(/[^a-z0-9_\-]+/gi, "_").slice(0, 80);
            headers["Content-Disposition"] = `attachment; filename="${safe}.m3u8"`;
          }
          return new Response(rewritten, { status: 200, headers });
        }

        return new Response(JSON.stringify({
          url: stream.url,
          referer: stream.referer,
          language: stream.language ?? null,
          server,
          type,
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      } catch (e) {
        errors[server] = String(e);
      }
    }

    return new Response(JSON.stringify({ error: "all servers failed", errors }), {
      status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
