// AniList metadata client with in-memory + localStorage caching.
// Cache key: `anilist:meta:<malId>`. TTL keeps fallback fast across page transitions
// while still refreshing when an airing series adds episodes.

const ID_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days (idMal -> AniList id is stable)
const META_TTL_MS = 6 * 60 * 60 * 1000;    // 6 hours (episodes/airing change)

const idMem = new Map<string, number | null>();
const metaMem = new Map<string, AniListMeta | null>();
const inflight = new Map<string, Promise<AniListMeta | null>>();

export interface AniListMeta {
  id: number;
  episodes: number | null;
  nextAiringEpisode: { episode: number } | null;
  streamingEpisodes: { title: string; thumbnail: string | null }[];
  /** Where the data came from on this read. */
  source?: 'network' | 'memory' | 'storage';
  /** Epoch ms when this payload was fetched from network. */
  fetchedAt?: number;
}

function lsGet<T>(key: string, ttl: number): T | null {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null;
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { t: number; v: T };
    if (!parsed || typeof parsed.t !== 'number') return null;
    if (Date.now() - parsed.t > ttl) return null;
    return parsed.v;
  } catch { return null; }
}

function lsSet<T>(key: string, value: T) {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(key, JSON.stringify({ t: Date.now(), v: value }));
  } catch { /* quota / private mode — ignore */ }
}

export async function malToAnilistId(malId: string): Promise<number | null> {
  if (idMem.has(malId)) return idMem.get(malId)!;
  const cached = lsGet<number | null>(`anilist:id:${malId}`, ID_TTL_MS);
  if (cached !== null) { idMem.set(malId, cached); return cached; }

  const query = `query ($malId: Int) { Media(idMal: $malId, type: ANIME) { id } }`;
  try {
    const res = await fetch('https://graphql.anilist.co', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, variables: { malId: parseInt(malId) } }),
    });
    const data = await res.json();
    const anilistId = data?.data?.Media?.id ?? null;
    idMem.set(malId, anilistId);
    lsSet(`anilist:id:${malId}`, anilistId);
    return anilistId;
  } catch {
    idMem.set(malId, null);
    return null;
  }
}

export async function fetchAnilistMeta(malId: string): Promise<AniListMeta | null> {
  if (metaMem.has(malId)) {
    const v = metaMem.get(malId);
    return v ? { ...v, source: 'memory' } : v ?? null;
  }
  const stored = lsGet<AniListMeta>(`anilist:meta:${malId}`, META_TTL_MS);
  if (stored) {
    metaMem.set(malId, stored);
    return { ...stored, source: 'storage' };
  }
  if (inflight.has(malId)) return inflight.get(malId)!;

  const p = (async (): Promise<AniListMeta | null> => {
    const query = `
      query ($malId: Int) {
        Media(idMal: $malId, type: ANIME) {
          id
          episodes
          nextAiringEpisode { episode }
          streamingEpisodes { title thumbnail }
        }
      }
    `;
    try {
      const res = await fetch('https://graphql.anilist.co', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, variables: { malId: parseInt(malId) } }),
      });
      const data = await res.json();
      const media = data?.data?.Media;
      if (!media) { metaMem.set(malId, null); return null; }
      const meta: AniListMeta = {
        id: media.id,
        episodes: media.episodes ?? null,
        nextAiringEpisode: media.nextAiringEpisode ?? null,
        streamingEpisodes: media.streamingEpisodes ?? [],
        fetchedAt: Date.now(),
      };
      idMem.set(malId, meta.id);
      lsSet(`anilist:id:${malId}`, meta.id);
      metaMem.set(malId, meta);
      lsSet(`anilist:meta:${malId}`, meta);
      return { ...meta, source: 'network' };
    } catch {
      metaMem.set(malId, null);
      return null;
    } finally {
      inflight.delete(malId);
    }
  })();

  inflight.set(malId, p);
  return p;
}

// Parse "Episode 13 - My Dream Home" / "Ep. 13: Title" → { num, title }.
// Exported for unit tests and reuse.
export function parseAnilistEpTitle(raw: string): { num: number | null; title: string } {
  if (!raw) return { num: null, title: '' };
  const m = raw.match(/^\s*(?:episode|ep\.?)\s*(\d+)\s*[-:–—]?\s*(.*)$/i);
  if (m) return { num: parseInt(m[1]), title: (m[2] || '').trim() };
  return { num: null, title: raw.trim() };
}

/** Detect Part / Cour offset from a Jikan anime title (e.g. "... Part 2" → 2). */
export function detectPartNumber(title: string | undefined | null): number {
  if (!title) return 1;
  const m = title.match(/\b(?:part|cour)\s*([0-9]+|ii|iii|iv|v)\b/i);
  if (!m) return 1;
  const raw = m[1].toLowerCase();
  const roman: Record<string, number> = { ii: 2, iii: 3, iv: 4, v: 5 };
  return roman[raw] ?? parseInt(raw) ?? 1;
}

export interface BuildEpisodesInput {
  jikanEpisodes: { mal_id: number; title?: string; aired?: string }[];
  anilistTotal: number;
  anilistTitles: Record<number, string>;
  estimatedAiring: number;
  jikanReportedTotal: number;
  /** 1-based start episode offset for this Part split (e.g. Part 2 starts at 13). */
  partStart?: number;
}

export interface BuildEpisodesResult {
  episodes: { mal_id: number; title: string; aired?: string | undefined; overallNumber: number }[];
  source: 'jikan' | 'anilist' | 'mixed' | 'estimated' | 'empty';
  reason: string;
  effectiveTotal: number;
}

/**
 * Single source of truth for merging Jikan + AniList episode lists.
 * - Sorts by overall episode number (partStart + index) when available.
 * - Enriches missing/generic Jikan titles with AniList streaming titles.
 * - Tops up missing episodes from AniList totals / airing estimate.
 */
export function buildDisplayEpisodes(input: BuildEpisodesInput): BuildEpisodesResult {
  const {
    jikanEpisodes, anilistTotal, anilistTitles,
    estimatedAiring, jikanReportedTotal, partStart = 1,
  } = input;

  const titleFor = (n: number, fallback?: string) =>
    anilistTitles[n] || fallback || `Episode ${n}`;

  const effectiveTotal = Math.max(
    jikanEpisodes.length, anilistTotal, jikanReportedTotal, estimatedAiring,
  );

  if (jikanEpisodes.length === 0 && effectiveTotal === 0) {
    return { episodes: [], source: 'empty', reason: 'No data from Jikan or AniList', effectiveTotal: 0 };
  }

  if (jikanEpisodes.length === 0) {
    const reason = anilistTotal > 0
      ? `Jikan returned 0 episodes; using AniList total (${anilistTotal})`
      : `Jikan returned 0 episodes; using airing estimate (${estimatedAiring})`;
    const episodes = Array.from({ length: effectiveTotal }, (_, i) => {
      const local = i + 1;
      return { mal_id: local, title: titleFor(local), overallNumber: partStart + i };
    });
    return { episodes, source: anilistTotal > 0 ? 'anilist' : 'estimated', reason, effectiveTotal };
  }

  // Sort Jikan by mal_id (which is the episode number for that anime entry).
  const sorted = [...jikanEpisodes].sort((a, b) => (a.mal_id ?? 0) - (b.mal_id ?? 0));

  let enrichedCount = 0;
  const enriched = sorted.map((ep, i) => {
    const local = ep.mal_id ?? (i + 1);
    const generic = !ep.title || /^episode\s*\d+$/i.test(ep.title);
    const title = generic ? titleFor(local, ep.title) : ep.title!;
    if (generic && anilistTitles[local]) enrichedCount++;
    return { mal_id: local, title, aired: ep.aired, overallNumber: partStart + local - 1 };
  });

  let toppedUp = 0;
  let final = enriched;
  if (effectiveTotal > enriched.length) {
    toppedUp = effectiveTotal - enriched.length;
    const extra = Array.from({ length: toppedUp }, (_, i) => {
      const local = enriched.length + i + 1;
      return { mal_id: local, title: titleFor(local), aired: undefined as string | undefined, overallNumber: partStart + local - 1 };
    });
    final = [...enriched, ...extra];
  }

  // Final stable sort by overall number.
  final.sort((a, b) => a.overallNumber - b.overallNumber);

  let source: BuildEpisodesResult['source'] = 'jikan';
  const reasons: string[] = [];
  if (enrichedCount > 0) { source = 'mixed'; reasons.push(`enriched ${enrichedCount} titles from AniList`); }
  if (toppedUp > 0) { source = 'mixed'; reasons.push(`topped up ${toppedUp} episodes from AniList/airing`); }
  if (reasons.length === 0) reasons.push('Jikan data was complete');

  return { episodes: final, source, reason: reasons.join('; '), effectiveTotal };
}
