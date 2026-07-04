// Extracts the direct MP4/HLS stream URL from vidzen.fun with retries and
// automatic fallback across all servers Vidzen advertises for a title.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";

const FETCH_TIMEOUT_MS = 8000;
const MAX_ATTEMPTS = 3;

type Source = { url: string; type?: string; label?: string; server?: string };
type Subtitle = { url: string; lang?: string };
type SourcesPayload = {
  sources?: Source[];
  subtitles?: Subtitle[];
  servers?: string[];
  provider?: string;
  sourcePool?: Record<string, { sources: Source[]; subtitles?: Subtitle[] }>;
};

function qualityRank(label?: string): number {
  if (!label) return 0;
  const m = /(\d{3,4})\s*p/i.exec(label);
  return m ? parseInt(m[1], 10) : 0;
}

async function fetchWithTimeout(url: string, ms: number): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, {
      headers: { "User-Agent": UA, Referer: "https://vidzen.fun/", Accept: "application/json" },
      signal: ctrl.signal,
    });
  } finally { clearTimeout(t); }
}

async function fetchSourcesOnce(type: string, id: string, season?: string, episode?: string, server?: string): Promise<SourcesPayload> {
  const params = new URLSearchParams({ type, id });
  if (season) params.set("season", season);
  if (episode) params.set("episode", episode);
  if (server) params.set("server", server);
  const url = `https://vidzen.fun/api/sources?${params}`;

  let lastErr: unknown;
  for (let i = 0; i < MAX_ATTEMPTS; i++) {
    try {
      const res = await fetchWithTimeout(url, FETCH_TIMEOUT_MS);
      if (!res.ok) {
        await res.body?.cancel();
        throw new Error(`vidzen sources ${res.status}`);
      }
      return await res.json() as SourcesPayload;
    } catch (e) {
      lastErr = e;
      if (i < MAX_ATTEMPTS - 1) await new Promise((r) => setTimeout(r, 400 * (i + 1)));
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

function pickBest(sources: Source[], preferred?: string): Source | null {
  if (!sources?.length) return null;
  if (preferred) {
    const want = qualityRank(preferred);
    const match = sources.find((s) => qualityRank(s.label) === want);
    if (match) return match;
  }
  return [...sources].sort((a, b) => qualityRank(b.label) - qualityRank(a.label))[0];
}

function absolutize(u: string): string {
  return u.startsWith("http") ? u : `https://vidzen.fun${u}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const u = new URL(req.url);
    const type = (u.searchParams.get("type") ?? "movie").toLowerCase();
    const id = u.searchParams.get("tmdb") ?? u.searchParams.get("id");
    const season = u.searchParams.get("season") ?? undefined;
    const episode = u.searchParams.get("episode") ?? undefined;
    const requestedServer = u.searchParams.get("server") ?? undefined;
    const quality = u.searchParams.get("quality") ?? undefined;

    if (!id) {
      return new Response(JSON.stringify({ error: "missing id/tmdb" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (type === "tv" && (!season || !episode)) {
      return new Response(JSON.stringify({ error: "missing season/episode" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // First discover which servers are available
    const initial = await fetchSourcesOnce(type, id, season, episode, requestedServer);
    let picked: Source | null = pickBest(initial.sources ?? [], quality);
    let used: SourcesPayload = initial;

    // If no sources, walk through the advertised server list until one yields playable media
    if (!picked?.url && Array.isArray(initial.servers) && initial.servers.length > 0) {
      for (const srv of initial.servers) {
        if (srv === requestedServer) continue;
        try {
          const alt = await fetchSourcesOnce(type, id, season, episode, srv);
          const cand = pickBest(alt.sources ?? [], quality);
          if (cand?.url) { picked = cand; used = alt; break; }
        } catch { /* try next */ }
      }
    }

    if (!picked?.url) {
      return new Response(JSON.stringify({ error: "no sources", servers: initial.servers ?? [] }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const absolute = absolutize(picked.url);

    if (u.searchParams.get("redirect") === "1") {
      return new Response(null, { status: 302, headers: { ...corsHeaders, Location: absolute } });
    }

    return new Response(JSON.stringify({
      url: absolute,
      type: picked.type ?? (/\.m3u8(\?|$)/.test(absolute) ? "hls" : "mp4"),
      label: picked.label ?? null,
      server: picked.server ?? used.provider ?? null,
      servers: used.servers ?? initial.servers ?? [],
      qualities: (used.sources ?? []).map((s) => ({
        label: s.label ?? null,
        url: absolutize(s.url),
        server: s.server ?? null,
      })),
      subtitles: used.subtitles ?? [],
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e instanceof Error ? e.message : e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
