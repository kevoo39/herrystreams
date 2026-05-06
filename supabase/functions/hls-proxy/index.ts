// Proxies HLS playlists and segments with the required Referer header.
// URL: /functions/v1/hls-proxy?url=<encoded>&ref=<encoded>
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, range",
  "Access-Control-Expose-Headers": "content-length, content-range, accept-ranges",
};

function selfBase(req: Request): string {
  const u = new URL(req.url);
  return `${u.origin}${u.pathname}`;
}

function rewritePlaylist(text: string, baseUrl: string, referer: string, proxyBase: string): string {
  const base = new URL(baseUrl);
  const lines = text.split(/\r?\n/);
  const out: string[] = [];
  for (let line of lines) {
    const trimmed = line.trim();
    if (!trimmed) { out.push(line); continue; }

    // Rewrite URI="..." attributes (keys, maps)
    if (trimmed.startsWith("#")) {
      const replaced = line.replace(/URI="([^"]+)"/g, (_m, u) => {
        const abs = new URL(u, base).toString();
        return `URI="${proxyBase}?url=${encodeURIComponent(abs)}&ref=${encodeURIComponent(referer)}"`;
      });
      out.push(replaced);
      continue;
    }

    // Plain URL line (segment or sub-playlist)
    try {
      const abs = new URL(trimmed, base).toString();
      out.push(`${proxyBase}?url=${encodeURIComponent(abs)}&ref=${encodeURIComponent(referer)}`);
    } catch {
      out.push(line);
    }
  }
  return out.join("\n");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const u = new URL(req.url);
    const target = u.searchParams.get("url");
    const referer = u.searchParams.get("ref") ?? "https://aniwaves.ru/";
    if (!target) {
      return new Response("missing url", { status: 400, headers: corsHeaders });
    }

    const headers: Record<string, string> = {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
      Referer: referer,
      Origin: new URL(referer).origin,
    };
    const range = req.headers.get("range");
    if (range) headers["Range"] = range;

    const upstream = await fetch(target, { headers });
    const ctype = upstream.headers.get("content-type") ?? "";
    const isPlaylist =
      target.includes(".m3u8") ||
      ctype.includes("mpegurl") ||
      ctype.includes("application/vnd.apple");

    const respHeaders: Record<string, string> = { ...corsHeaders };
    const passthrough = ["content-type", "content-length", "content-range", "accept-ranges", "cache-control"];
    for (const h of passthrough) {
      const v = upstream.headers.get(h);
      if (v) respHeaders[h] = v;
    }

    if (isPlaylist) {
      const text = await upstream.text();
      const rewritten = rewritePlaylist(text, target, referer, selfBase(req));
      respHeaders["content-type"] = "application/vnd.apple.mpegurl";
      delete respHeaders["content-length"];
      return new Response(rewritten, { status: upstream.status, headers: respHeaders });
    }

    return new Response(upstream.body, { status: upstream.status, headers: respHeaders });
  } catch (e) {
    return new Response(`proxy error: ${e}`, { status: 500, headers: corsHeaders });
  }
});
