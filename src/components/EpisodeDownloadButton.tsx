// Reusable "Download" button for a single piece of content: a movie, a TV
// episode, or an anime episode. Extracts the ad-free Vidzen/anime stream,
// downloads it via the appropriate downloader, and records the result to
// the local Downloads history so it shows up in /downloads.

import React, { useState, useRef } from 'react';
import { Download, Loader2, X, Check, AlertCircle } from 'lucide-react';
import { downloadMp4, type MP4Progress } from '@/lib/mp4Downloader';
import { downloadHls, type DLProgress } from '@/lib/hlsDownloader';
import { recordDownload } from '@/lib/downloads';

const FN_BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;
const APIKEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

async function fetchJsonWithRetry(url: string, retries = 3, timeoutMs = 15000): Promise<any> {
  let lastErr: unknown;
  for (let i = 0; i <= retries; i++) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const r = await fetch(url, { headers: { apikey: APIKEY }, signal: ctrl.signal });
      clearTimeout(t);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return await r.json();
    } catch (e) {
      clearTimeout(t);
      lastErr = e;
      if (i < retries) await new Promise(r => setTimeout(r, 400 * Math.pow(2, i)));
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

export type DownloadTarget =
  | { kind: 'movie'; tmdbId: number; parentTitle: string; image?: string }
  | { kind: 'tv'; tmdbId: number; season: number; episode: number; parentTitle: string; image?: string }
  | { kind: 'anime'; anilistId: number; malId?: string; episode: number; audioType: 'sub' | 'dub'; parentTitle: string; image?: string };

interface Props {
  target: DownloadTarget;
  variant?: 'icon' | 'full';
  className?: string;
}

const EpisodeDownloadButton: React.FC<Props> = ({ target, variant = 'icon', className }) => {
  const [progress, setProgress] = useState<number | null>(null); // 0..100
  const [state, setState] = useState<'idle' | 'busy' | 'done' | 'error'>('idle');
  const [err, setErr] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const buildTitle = (): { display: string; filename: string; id: string } => {
    if (target.kind === 'movie') {
      return {
        display: target.parentTitle,
        filename: target.parentTitle,
        id: `movie-${target.tmdbId}`,
      };
    }
    if (target.kind === 'tv') {
      const pad = (n: number) => String(n).padStart(2, '0');
      const tag = `S${pad(target.season)}E${pad(target.episode)}`;
      return {
        display: `${target.parentTitle} · ${tag}`,
        filename: `${target.parentTitle} ${tag}`,
        id: `tv-${target.tmdbId}-s${target.season}e${target.episode}`,
      };
    }
    const tag = `E${String(target.episode).padStart(2, '0')} · ${target.audioType.toUpperCase()}`;
    return {
      display: `${target.parentTitle} · ${tag}`,
      filename: `${target.parentTitle} E${target.episode} ${target.audioType}`,
      id: `anime-${target.anilistId}-${target.episode}-${target.audioType}`,
    };
  };

  const start = async () => {
    if (state === 'busy') return;
    setState('busy'); setProgress(0); setErr(null);
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    const { display, filename, id } = buildTitle();

    try {
      if (target.kind === 'movie' || target.kind === 'tv') {
        const params = new URLSearchParams({ type: target.kind, tmdb: String(target.tmdbId) });
        if (target.kind === 'tv') {
          params.set('season', String(target.season));
          params.set('episode', String(target.episode));
        }
        const data = await fetchJsonWithRetry(`${FN_BASE}/vidzen-extract?${params}`);
        if (!data?.url) throw new Error('No stream URL');
        const isHls = data.type === 'hls' || /\.m3u8(\?|$)/.test(data.url);

        if (isHls) {
          const proxied = `${FN_BASE}/hls-proxy?url=${encodeURIComponent(data.url)}&ref=${encodeURIComponent('https://vidzen.fun/')}`;
          await downloadHls(proxied, filename, (p: DLProgress) => {
            if (p.status === 'downloading' && p.total > 0) setProgress(Math.round((p.done / p.total) * 100));
            if (p.status === 'done') {
              setProgress(100);
              recordDownload({
                id, kind: target.kind, title: display, parentTitle: target.parentTitle,
                image: target.image, savedAt: new Date().toISOString(),
                filename: p.filename, bytes: p.blobSize,
                tmdbId: target.tmdbId,
                season: target.kind === 'tv' ? target.season : undefined,
                episode: target.kind === 'tv' ? target.episode : undefined,
              });
            }
          }, ctrl.signal);
        } else {
          const proxied = `${FN_BASE}/mp4-proxy?url=${encodeURIComponent(data.url)}&dl=1&name=${encodeURIComponent(filename)}&apikey=${APIKEY}`;
          await downloadMp4(proxied, filename, (p: MP4Progress) => {
            if (p.status === 'downloading' && p.total > 0) setProgress(Math.round((p.bytes / p.total) * 100));
            if (p.status === 'done') {
              setProgress(100);
              recordDownload({
                id, kind: target.kind, title: display, parentTitle: target.parentTitle,
                image: target.image, savedAt: new Date().toISOString(),
                filename: p.filename, bytes: p.bytes,
                tmdbId: target.tmdbId,
                season: target.kind === 'tv' ? target.season : undefined,
                episode: target.kind === 'tv' ? target.episode : undefined,
              });
            }
          }, ctrl.signal);
        }
      } else {
        // anime
        const data = await fetchJsonWithRetry(
          `${FN_BASE}/anime-extract?anilist=${target.anilistId}&ep=${target.episode}&type=${target.audioType}`,
        );
        if (!data?.url) throw new Error('No stream URL');
        const proxied = data.ctx && data.path
          ? `${FN_BASE}/hls-proxy?ctx=${encodeURIComponent(data.ctx)}&path=${encodeURIComponent(data.path)}&ref=${encodeURIComponent(data.referer || '')}`
          : `${FN_BASE}/hls-proxy?url=${encodeURIComponent(data.url)}&ref=${encodeURIComponent(data.referer || '')}`;
        await downloadHls(proxied, filename, (p: DLProgress) => {
          if (p.status === 'downloading' && p.total > 0) setProgress(Math.round((p.done / p.total) * 100));
          if (p.status === 'done') {
            setProgress(100);
            recordDownload({
              id, kind: 'anime', title: display, parentTitle: target.parentTitle,
              image: target.image, savedAt: new Date().toISOString(),
              filename: p.filename, bytes: p.blobSize,
              anilistId: target.anilistId, malId: target.malId,
              animeEpisode: target.episode, audioType: target.audioType,
            });
          }
        }, ctrl.signal);
      }
      setState('done');
      setTimeout(() => { setState('idle'); setProgress(null); }, 3000);
    } catch (e: any) {
      setState('error');
      setErr(e?.message || 'Download failed');
      setTimeout(() => { setState('idle'); setProgress(null); setErr(null); }, 4000);
    }
  };

  const cancel = (e: React.MouseEvent) => {
    e.stopPropagation();
    abortRef.current?.abort();
    setState('idle'); setProgress(null);
  };

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (state === 'busy') return;
    start();
  };

  const label =
    state === 'busy' ? (progress != null ? `${progress}%` : '…') :
    state === 'done' ? 'Saved' :
    state === 'error' ? 'Retry' : 'Download';

  const Icon =
    state === 'busy' ? Loader2 :
    state === 'done' ? Check :
    state === 'error' ? AlertCircle : Download;

  if (variant === 'full') {
    return (
      <button
        onClick={handleClick}
        title={err || label}
        className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all ${
          state === 'error' ? 'bg-destructive text-destructive-foreground' :
          state === 'done' ? 'bg-green-600 text-white' :
          state === 'busy' ? 'bg-secondary text-foreground' :
          'bg-primary text-primary-foreground hover:brightness-110'
        } ${className || ''}`}
      >
        <Icon size={14} className={state === 'busy' ? 'animate-spin' : ''} />
        <span>{label}</span>
        {state === 'busy' && (
          <span onClick={cancel} className="ml-1 opacity-70 hover:opacity-100"><X size={12} /></span>
        )}
      </button>
    );
  }

  return (
    <button
      onClick={handleClick}
      title={err || `${label} — ${target.kind === 'anime' ? target.audioType.toUpperCase() : 'MP4'}`}
      className={`relative flex items-center justify-center w-8 h-8 rounded-lg border transition-all shrink-0 ${
        state === 'error' ? 'border-destructive/50 bg-destructive/10 text-destructive' :
        state === 'done' ? 'border-green-500/50 bg-green-500/10 text-green-500' :
        state === 'busy' ? 'border-primary/50 bg-primary/10 text-primary' :
        'border-border/40 bg-secondary/40 text-muted-foreground hover:border-primary/40 hover:text-primary'
      } ${className || ''}`}
    >
      <Icon size={14} className={state === 'busy' ? 'animate-spin' : ''} />
      {state === 'busy' && progress != null && progress > 0 && (
        <span className="absolute -bottom-1 left-0 right-0 h-0.5 bg-background rounded-full overflow-hidden">
          <span className="block h-full bg-primary transition-all" style={{ width: `${progress}%` }} />
        </span>
      )}
    </button>
  );
};

export default EpisodeDownloadButton;
