// Tracks last-watched position + player settings per item, for offline resume.
const KEY = "kevnest-resume-v1";
const SETTINGS_KEY = "kevnest-player-settings-v1";

export type ResumeKind = "movie" | "tv" | "anime";

export interface ResumeEntry {
  id: string;            // unique key per playable: e.g. movie:27205, tv:1399:1:1, anime:21:5:sub
  kind: ResumeKind;
  title: string;
  poster?: string;
  // Movie/TV
  tmdbId?: number;
  season?: number;
  episode?: number;
  // Anime
  malId?: string;
  anilistId?: number;
  animeEpisode?: number;
  audioType?: "sub" | "dub";
  // Playback state
  position: number;      // seconds
  duration: number;      // seconds
  updatedAt: number;     // ms epoch
}

export interface PlayerSettings {
  volume: number;        // 0..1
  muted: boolean;
  playbackRate: number;
  preferNative: boolean; // ad-free native HLS path on by default
  preferredAudio: "sub" | "dub";
  preferredAnimeServer?: string;
  preferredMediaServer?: string;
}

const DEFAULT_SETTINGS: PlayerSettings = {
  volume: 1,
  muted: false,
  playbackRate: 1,
  preferNative: true,
  preferredAudio: "sub",
};

export function buildResumeId(e: Omit<ResumeEntry, "id" | "position" | "duration" | "updatedAt" | "title">): string {
  if (e.kind === "movie") return `movie:${e.tmdbId}`;
  if (e.kind === "tv") return `tv:${e.tmdbId}:${e.season}:${e.episode}`;
  return `anime:${e.malId ?? e.anilistId}:${e.animeEpisode}:${e.audioType ?? "sub"}`;
}

export function getAllResume(): ResumeEntry[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const list = JSON.parse(raw) as ResumeEntry[];
    return Array.isArray(list) ? list.sort((a, b) => b.updatedAt - a.updatedAt) : [];
  } catch { return []; }
}

export function getResume(id: string): ResumeEntry | null {
  return getAllResume().find((e) => e.id === id) ?? null;
}

export function getLastResume(): ResumeEntry | null {
  return getAllResume()[0] ?? null;
}

export function saveResume(entry: ResumeEntry): void {
  try {
    const list = getAllResume().filter((e) => e.id !== entry.id);
    list.unshift(entry);
    // Cap at 50 most recent
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, 50)));
  } catch { /* quota or private mode */ }
}

export function removeResume(id: string): void {
  try {
    const list = getAllResume().filter((e) => e.id !== id);
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch { /* ignore */ }
}

export function getPlayerSettings(): PlayerSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    return { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<PlayerSettings>) };
  } catch { return { ...DEFAULT_SETTINGS }; }
}

export function savePlayerSettings(patch: Partial<PlayerSettings>): PlayerSettings {
  const next = { ...getPlayerSettings(), ...patch };
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(next)); } catch { /* ignore */ }
  return next;
}
