// Extracts the direct MP4 stream URL from vidzen.fun.
// Vidzen exposes /api/sources?type=movie|tv&id=...&season=&episode=
// returning JSON with { sources: [{ url: "/api/stream/<hash>", label: "1080p", ... }], subtitles, servers }.
// /api/stream/<hash> is a CORS-open MP4 with Accept-Ranges — no HLS proxy needed.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";

type Source = { url: string; type?: string; label?: string; server?: string };
type Subtitle = { url: string; lang?: string };

function qualityRank(label?: string): number {
  if (!label) return 0;
  const m = /(\d{3,4})\s*p/i.exec(label);
  return m ? parseInt(m[1], 10) : 0;
}

async function fetchSources(type: string, id: string, season?: string, episode?: string, server?: string) {
  const params = new URLSearchParams({ type, id });
  if (season) params.set("season", season);
  if (episode) params.set("episode", episode);
  if (server) params.set("server", server);

  const url = `https://vidzen.fun/api/sources?${params}`;
  const res = await fetch(url, {
    headers: { "User-Agent": UA, Referer: "https://vidzen.fun/", Accept: "application/json" },
  });
  if (!res.ok) {
    await res.body?.cancel();
    throw new Error(`vidzen sources ${res.status}`);
  }
  return res.json() as Promise<{
    sources?: Source[];
    subtitles?: Subtitle[];
    servers?: string[];
    provider?: string;
    sourcePool?: Record<string, { sources: Source[]; subtitles?: Subtitle[] }>;
  }>;
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const u = new URL(req.url);
    const type = (u.searchParams.get("type") ?? "movie").toLowerCase();
    const id = u.searchParams.get("tmdb") ?? u.searchParams.get("id");
    const season = u.searchParams.get("season") ?? undefined;
    const episode = u.searchParams.get("episode") ?? undefined;
    const server = u.searchParams.get("server") ?? undefined;
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

    const data = await fetchSources(type, id, season, episode, server);
    const sources = data.sources ?? [];
    const picked = pickBest(sources, quality);
    if (!picked?.url) {
      return new Response(JSON.stringify({ error: "no sources", servers: data.servers ?? [] }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const absolute = picked.url.startsWith("http")
      ? picked.url
      : `https://vidzen.fun${picked.url}`;

    // Optional: 302 to the MP4 directly so callers can use it as <video src>
    if (u.searchParams.get("redirect") === "1") {
      return new Response(null, { status: 302, headers: { ...corsHeaders, Location: absolute } });
    }

    return new Response(JSON.stringify({
      url: absolute,
      type: picked.type ?? "mp4",
      label: picked.label ?? null,
      server: picked.server ?? data.provider ?? null,
      servers: data.servers ?? [],
      qualities: sources.map((s) => ({
        label: s.label ?? null,
        url: s.url?.startsWith("http") ? s.url : `https://vidzen.fun${s.url}`,
        server: s.server ?? null,
      })),
      subtitles: data.subtitles ?? [],
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e instanceof Error ? e.message : e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
