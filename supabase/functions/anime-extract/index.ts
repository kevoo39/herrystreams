// Extracts the underlying .m3u8 URL from Vidnest anime endpoints with
// retries and automatic fallback between Hianime/Aniwave and Anitaku.
const ALPHABET = "RB0fpH8ZEyVLkv7c2i6MAJ5u3IKFDxlS1NTsnGaqmXYdUrtzjwObCgQP94hoeW+/=";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:137.0) Gecko/20100101 Firefox/137.0";
const FETCH_TIMEOUT_MS = 15_000;
const SERVERS = ["aniwave", "anitaku"] as const;

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

async function fetchWithTimeout(endpoint: string): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(endpoint, {
      headers: {
        "User-Agent": UA,
        Accept: "*/*",
        "Accept-Language": "en-US,en;q=0.5",
        Referer: "https://megaplay.buzz/",
        Origin: "https://megaplay.buzz",
      },
      signal: ctrl.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

async function readPayload(res: Response): Promise<any> {
  const raw = await res.json();
  if (raw?.encrypted && typeof raw.data === "string") {
    const decoded = decryptCipher(raw.data);
    try { return JSON.parse(decoded); } catch { return { raw: decoded }; }
  }
  return raw;
}

function endpointFor(server: string, anilistId: string, ep: string, type: string) {
  return server === "anitaku"
    ? `https://new.vidnest.fun/anitaku/${anilistId}/${ep}/${type}/hd-2`
    : `https://new.vidnest.fun/hianime/anime/${anilistId}/${ep}/${type}`;
}

function refererFor(server: string) {
  return server === "anitaku" ? "https://anitaku.to" : "https://megaplay.buzz/";
}

function pickSource(payload: any, server: string) {
  const sources = payload?.sources ?? payload?.multiSrc ?? [];
  if (!Array.isArray(sources) || sources.length === 0) return null;
  if (server === "anitaku") {
    return sources.find((s: any) => s?.server === "HD-2" && s?.url)
      ?? sources.find((s: any) => s?.quality === "HD" && s?.url)
      ?? sources.find((s: any) => s?.url || s?.file);
  }
  return sources.find((s: any) => s?.file || s?.url) ?? null;
}

async function extractFromServer(server: string, anilistId: string, ep: string, type: string) {
  let lastError = "unknown";
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetchWithTimeout(endpointFor(server, anilistId, ep, type));
      if (!res.ok) {
        lastError = `upstream ${res.status}`;
        await res.body?.cancel();
        throw new Error(lastError);
      }
      const payload = await readPayload(res);
      const pick = pickSource(payload, server);
      const streamUrl = pick?.file ?? pick?.url;
      if (!streamUrl) throw new Error("no stream URL");
      const referer = pick?.referer ?? pick?.headers?.Referer ?? refererFor(server);
      return {
        url: streamUrl,
        referer,
        tracks: payload.tracks ?? pick?.subtitles ?? [],
        intro: payload.intro ?? null,
        outro: payload.outro ?? null,
        server,
        type,
      };
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e);
      if (attempt < 2) await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
    }
  }
  throw new Error(`${server}: ${lastError}`);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const anilistId = url.searchParams.get("anilist");
    const ep = url.searchParams.get("ep") ?? "1";
    const type = (url.searchParams.get("type") ?? "sub").toLowerCase();
    const server = (url.searchParams.get("server") ?? "aniwave").toLowerCase();

    if (!anilistId) {
      return new Response(JSON.stringify({ error: "missing anilist" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const orderedServers = [server, ...SERVERS.filter((s) => s !== server)];
    const errors: string[] = [];

    for (const srv of orderedServers) {
      try {
        const payload = await extractFromServer(srv, anilistId, ep, type);
        const ctx = btoa(JSON.stringify({ type: "anime", server: srv, anilist: anilistId, episode: ep, audioType: type }));
        const path = payload.url.split("/").pop()?.split("?")[0] || "master.m3u8";
        return new Response(
          JSON.stringify({ ...payload, ctx, path }),
          { headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" } },
        );
      } catch (e) {
        errors.push(e instanceof Error ? e.message : String(e));
      }
    }

    return new Response(
      JSON.stringify({ error: "all anime servers failed", servers: orderedServers, errors }),
      { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
