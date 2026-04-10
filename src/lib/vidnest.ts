/**
 * KevNest Streaming Service
 * Unified streaming through Vidnest servers for all content types
 */

export type AudioType = 'sub' | 'dub';

interface StreamServer {
  name: string;
  buildMovieUrl: (tmdbId: number) => string;
  buildTVUrl: (tmdbId: number, season: number, episode: number) => string;
  buildAnimeUrl: (anilistId: number, episode: number, audioType: AudioType) => string;
}

const SERVERS: StreamServer[] = [
  {
    name: 'KevNest',
    buildMovieUrl: (id) => `https://vidnest.fun/movie/${id}`,
    buildTVUrl: (id, s, e) => `https://vidnest.fun/tv/${id}/${s}/${e}`,
    buildAnimeUrl: (id, ep, type) => `https://vidnest.fun/anime/${id}/${ep}/${type}`,
  },
  {
    name: 'KevNest Pro',
    buildMovieUrl: (id) => `https://vidnest.fun/embed/movie/${id}`,
    buildTVUrl: (id, s, e) => `https://vidnest.fun/embed/tv/${id}/${s}/${e}`,
    buildAnimeUrl: (id, ep, type) => `https://vidnest.fun/anime/${id}/${ep}/${type}`,
  },
  {
    name: 'Backup',
    buildMovieUrl: (id) => `https://vidsrc.to/embed/movie/${id}`,
    buildTVUrl: (id, s, e) => `https://vidsrc.to/embed/tv/${id}/${s}/${e}`,
    buildAnimeUrl: (id, ep, type) => `https://2anime.xyz/embed/${id}?ep=${ep}&type=${type}`,
  },
];

export function getServers() {
  return SERVERS;
}

export function getMovieStreamUrl(tmdbId: number, serverIndex = 0): string {
  return SERVERS[serverIndex % SERVERS.length].buildMovieUrl(tmdbId);
}

export function getMovieStreamUrls(tmdbId: number): string[] {
  return SERVERS.map(s => s.buildMovieUrl(tmdbId));
}

export function getTVStreamUrl(tmdbId: number, season: number, episode: number, serverIndex = 0): string {
  return SERVERS[serverIndex % SERVERS.length].buildTVUrl(tmdbId, season, episode);
}

export function getTVStreamUrls(tmdbId: number, season: number, episode: number): string[] {
  return SERVERS.map(s => s.buildTVUrl(tmdbId, season, episode));
}

export function getAnimeStreamUrl(anilistId: number, episode: number, audioType: AudioType, serverIndex = 0): string {
  return SERVERS[serverIndex % SERVERS.length].buildAnimeUrl(anilistId, episode, audioType);
}

export function getAnimeStreamUrls(anilistId: number, episode: number, audioType: AudioType): string[] {
  return SERVERS.map(s => s.buildAnimeUrl(anilistId, episode, audioType));
}