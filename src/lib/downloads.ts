// Client-side download history: tracks what the user has downloaded so we can
// show a Downloads tab per content type (Movies / TV / Anime). Files themselves
// live in the browser's Downloads folder — this store is metadata + re-download.

const KEY = 'kevnest-downloads-v1';

export type DownloadKind = 'movie' | 'tv' | 'anime';

export interface DownloadEntry {
  id: string;                // stable key, e.g. tv-1399-s1e1 / anime-9253-2-sub / movie-12345
  kind: DownloadKind;
  title: string;             // display title (e.g. "Attack on Titan · S1E3")
  parentTitle: string;       // series/movie title without episode suffix
  image?: string;
  savedAt: string;           // ISO date
  filename?: string;
  bytes?: number;
  // Kind-specific fields used to re-download later
  tmdbId?: number;
  season?: number;
  episode?: number;
  anilistId?: number;
  malId?: string;
  animeEpisode?: number;
  audioType?: 'sub' | 'dub';
}

export function listDownloads(kind?: DownloadKind): DownloadEntry[] {
  try {
    const raw = localStorage.getItem(KEY);
    const arr: DownloadEntry[] = raw ? JSON.parse(raw) : [];
    return kind ? arr.filter(e => e.kind === kind) : arr;
  } catch { return []; }
}

export function recordDownload(entry: DownloadEntry): void {
  const all = listDownloads();
  const next = [entry, ...all.filter(e => e.id !== entry.id)];
  try { localStorage.setItem(KEY, JSON.stringify(next.slice(0, 500))); } catch { /* quota */ }
  try { window.dispatchEvent(new CustomEvent('kevnest-downloads-changed')); } catch { /* no-op */ }
}

export function removeDownload(id: string): void {
  const next = listDownloads().filter(e => e.id !== id);
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* quota */ }
  try { window.dispatchEvent(new CustomEvent('kevnest-downloads-changed')); } catch { /* no-op */ }
}

export function clearDownloads(kind?: DownloadKind): void {
  if (!kind) { localStorage.removeItem(KEY); }
  else {
    const next = listDownloads().filter(e => e.kind !== kind);
    localStorage.setItem(KEY, JSON.stringify(next));
  }
  try { window.dispatchEvent(new CustomEvent('kevnest-downloads-changed')); } catch { /* no-op */ }
}
