// Extracts the underlying .m3u8 URL from vidnest's anime endpoints
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

    const endpoint =
      server === "anitaku"
        ? `https://new.vidnest.fun/anitaku/${anilistId}/${ep}/${type}/hd-2`
        : `https://new.vidnest.fun/aniwave_hls/${anilistId}/${ep}/${type}`;

    const referer = server === "anitaku" ? "https://anitaku.to" : "https://aniwaves.ru/";

    const res = await fetch(endpoint, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
        Referer: "https://vidnest.fun/",
        Origin: "https://vidnest.fun",
      },
    });

    if (!res.ok) {
      return new Response(JSON.stringify({ error: `upstream ${res.status}` }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const raw = await res.json();
    let payload: any = raw;
    if (raw?.encrypted && typeof raw.data === "string") {
      const decoded = decryptCipher(raw.data);
      try { payload = JSON.parse(decoded); } catch { payload = { raw: decoded }; }
    }

    const sources = payload?.sources ?? payload?.multiSrc ?? [];
    if (!Array.isArray(sources) || sources.length === 0) {
      return new Response(JSON.stringify({ error: "no sources", payload }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const pick = sources[0];
    return new Response(
      JSON.stringify({
        url: pick.url,
        referer: pick.referer ?? referer,
        tracks: payload.tracks ?? [],
        server,
        type,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
