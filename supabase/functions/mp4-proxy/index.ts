// Streams an upstream MP4 (or any binary) through our edge so:
//  - the URL the <video> element sees is ours, not the provider's
//  - Range requests pass through transparently (seeking works)
//  - we strip cookies / referer leaks / ad-injection risk
//  - Content-Disposition can force a friendly filename for downloads
//
// Usage:
//   /functions/v1/mp4-proxy?url=<urlencoded-mp4>&name=<friendly>&dl=1

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, range",
  "Access-Control-Expose-Headers": "content-length, content-range, accept-ranges, content-type",
  "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
};

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";

// Allow-list of upstream hosts we proxy. Prevents open-proxy abuse.
const ALLOW_HOSTS = new Set<string>([
  "vidzen.fun",
  "new.vidnest.fun",
  "vidnest.fun",
]);

function isAllowed(u: URL): boolean {
  if (ALLOW_HOSTS.has(u.hostname)) return true;
  // also allow any subdomain of vidzen.fun (their CDN may use sv-*.vidzen.fun)
  return u.hostname.endsWith(".vidzen.fun");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const u = new URL(req.url);
    const target = u.searchParams.get("url");
    if (!target) {
      return new Response("missing url", { status: 400, headers: corsHeaders });
    }
    let upstream: URL;
    try { upstream = new URL(target); } catch {
      return new Response("bad url", { status: 400, headers: corsHeaders });
    }
    if (!isAllowed(upstream)) {
      return new Response("host not allowed", { status: 403, headers: corsHeaders });
    }

    const reqHeaders: Record<string, string> = {
      "User-Agent": UA,
      Accept: "*/*",
      Referer: `${upstream.origin}/`,
    };
    const range = req.headers.get("range");
    if (range) reqHeaders["Range"] = range;

    const upstreamRes = await fetch(upstream.toString(), {
      method: req.method === "HEAD" ? "HEAD" : "GET",
      headers: reqHeaders,
      redirect: "follow",
    });

    const outHeaders = new Headers(corsHeaders);
    const passthrough = [
      "content-type",
      "content-length",
      "content-range",
      "accept-ranges",
      "last-modified",
      "etag",
    ];
    for (const h of passthrough) {
      const v = upstreamRes.headers.get(h);
      if (v) outHeaders.set(h, v);
    }
    // Force a sane content-type if upstream omitted it
    if (!outHeaders.has("content-type")) outHeaders.set("content-type", "video/mp4");
    outHeaders.set("cache-control", "public, max-age=3600");

    if (u.searchParams.get("dl") === "1") {
      const raw = u.searchParams.get("name") || "video";
      const safe = raw.replace(/[^a-z0-9_\-]+/gi, "_").slice(0, 80) || "video";
      outHeaders.set("Content-Disposition", `attachment; filename="${safe}.mp4"`);
    }

    return new Response(upstreamRes.body, {
      status: upstreamRes.status,
      headers: outHeaders,
    });
  } catch (e) {
    return new Response(String(e instanceof Error ? e.message : e), {
      status: 502, headers: corsHeaders,
    });
  }
});
