const cache = new Map<string, number | null>();
const metaCache = new Map<string, AniListMeta | null>();

export interface AniListMeta {
  id: number;
  episodes: number | null;
  nextAiringEpisode: { episode: number } | null;
  streamingEpisodes: { title: string; thumbnail: string | null }[];
}

export async function malToAnilistId(malId: string): Promise<number | null> {
  if (cache.has(malId)) return cache.get(malId)!;

  const query = `
    query ($malId: Int) {
      Media(idMal: $malId, type: ANIME) { id }
    }
  `;

  try {
    const res = await fetch('https://graphql.anilist.co', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, variables: { malId: parseInt(malId) } }),
    });
    const data = await res.json();
    const anilistId = data?.data?.Media?.id ?? null;
    cache.set(malId, anilistId);
    return anilistId;
  } catch {
    cache.set(malId, null);
    return null;
  }
}

export async function fetchAnilistMeta(malId: string): Promise<AniListMeta | null> {
  if (metaCache.has(malId)) return metaCache.get(malId)!;

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
    if (!media) { metaCache.set(malId, null); return null; }
    const meta: AniListMeta = {
      id: media.id,
      episodes: media.episodes ?? null,
      nextAiringEpisode: media.nextAiringEpisode ?? null,
      streamingEpisodes: media.streamingEpisodes ?? [],
    };
    cache.set(malId, meta.id);
    metaCache.set(malId, meta);
    return meta;
  } catch {
    metaCache.set(malId, null);
    return null;
  }
}
