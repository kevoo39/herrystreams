const cache = new Map<string, number | null>();

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
