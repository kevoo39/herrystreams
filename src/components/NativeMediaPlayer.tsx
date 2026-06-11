import React, { useEffect, useRef, useState } from 'react';
import Hls from 'hls.js';
import { AlertCircle, Loader2, RefreshCw, Shield, Download, RotateCcw, X } from 'lucide-react';
import {
  buildResumeId, getResume, saveResume, getPlayerSettings, savePlayerSettings,
  type ResumeKind,
} from '@/lib/resume';
import { downloadHls, type DLProgress } from '@/lib/hlsDownloader';

type Mode =
  | { kind: 'anime'; anilistId: number; episode: number; audioType: 'sub' | 'dub'; malId?: string }
  | { kind: 'movie'; tmdbId: number }
  | { kind: 'tv'; tmdbId: number; season: number; episode: number };

interface NativeMediaPlayerProps {
  mode: Mode;
  title: string;
  poster?: string;
  onFallback?: () => void;
}

const FN_BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;
const APIKEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

const animeServers: ('aniwave' | 'anitaku')[] = ['aniwave', 'anitaku'];
const mediaServers = ['vidzen', 'allmovies', 'moviebox', 'catflix', 'flixhq', 'vidlink'];

const isMp4Server = (s: string) => s === 'vidzen';

const NativeMediaPlayer: React.FC<NativeMediaPlayerProps> = ({ mode, title, poster, onFallback }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [playlistUrl, setPlaylistUrl] = useState<string | null>(null);
  const [mp4Url, setMp4Url] = useState<string | null>(null);
  const [mp4Label, setMp4Label] = useState<string | null>(null);
  const [serverIdx, setServerIdx] = useState(0);
  const [resumePromptAt, setResumePromptAt] = useState<number | null>(null);

  const resumeId = buildResumeId({
    kind: mode.kind as ResumeKind,
    tmdbId: 'tmdbId' in mode ? mode.tmdbId : undefined,
    season: 'season' in mode ? mode.season : undefined,
    episode: 'episode' in mode ? mode.episode : undefined,
    malId: mode.kind === 'anime' ? mode.malId : undefined,
    anilistId: mode.kind === 'anime' ? mode.anilistId : undefined,
    animeEpisode: mode.kind === 'anime' ? mode.episode : undefined,
    audioType: mode.kind === 'anime' ? mode.audioType : undefined,
  });

  // Build inline playlist URL (single-invocation: extract + fetch playlist on same edge IP)
  const buildPlaylistUrl = (idx: number, dl = false) => {
    const params = new URLSearchParams({ inline: '1' });
    if (dl) { params.set('dl', '1'); params.set('name', title); }
    if (mode.kind === 'movie') {
      params.set('type', 'movie');
      params.set('tmdb', String(mode.tmdbId));
      params.set('server', mediaServers[idx % mediaServers.length]);
      return `${FN_BASE}/media-extract?${params.toString()}&apikey=${APIKEY}`;
    }
    if (mode.kind === 'tv') {
      params.set('type', 'tv');
      params.set('tmdb', String(mode.tmdbId));
      params.set('season', String(mode.season));
      params.set('episode', String(mode.episode));
      params.set('server', mediaServers[idx % mediaServers.length]);
      return `${FN_BASE}/media-extract?${params.toString()}&apikey=${APIKEY}`;
    }
    // anime — anime-extract still returns JSON, fall back to old proxy chain
    return null;
  };

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setPlaylistUrl(null);
    setMp4Url(null);
    setMp4Label(null);

    const load = async () => {
      try {
        const currentServer = mode.kind === 'anime'
          ? animeServers[serverIdx % animeServers.length]
          : mediaServers[serverIdx % mediaServers.length];

        // === MP4 branch (Vidzen): native progressive playback via our proxy ===
        if ((mode.kind === 'movie' || mode.kind === 'tv') && isMp4Server(currentServer)) {
          const params = new URLSearchParams({
            type: mode.kind,
            tmdb: String(mode.kind === 'movie' ? mode.tmdbId : mode.tmdbId),
          });
          if (mode.kind === 'tv') {
            params.set('season', String(mode.season));
            params.set('episode', String(mode.episode));
          }
          const extractRes = await fetch(`${FN_BASE}/vidzen-extract?${params}`, {
            headers: { apikey: APIKEY },
          });
          if (!extractRes.ok) throw new Error(`vidzen ${extractRes.status}`);
          const data = await extractRes.json();
          if (!data?.url) throw new Error('Vidzen returned no MP4');

          // Route MP4 through our edge so the URL is OURS — no ads, no redirects
          const proxiedMp4 = `${FN_BASE}/mp4-proxy?url=${encodeURIComponent(data.url)}&apikey=${APIKEY}`;
          if (cancelled) return;
          setMp4Url(proxiedMp4);
          setMp4Label(data.label || null);

          const video = videoRef.current;
          if (!video) return;
          const settings = getPlayerSettings();
          video.volume = settings.volume;
          video.muted = settings.muted;
          video.playbackRate = settings.playbackRate;
          if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null; }

          video.src = proxiedMp4;
          const onReady = () => {
            setLoading(false);
            const saved = getResume(resumeId);
            if (saved && saved.position > 30 && saved.duration > 0 && saved.position < saved.duration * 0.95) {
              setResumePromptAt(saved.position);
            } else {
              video.play().catch(() => {});
            }
          };
          video.addEventListener('loadedmetadata', onReady, { once: true });
          video.addEventListener('error', () => {
            if (cancelled) return;
            // Auto-advance on MP4 failure
            if (serverIdx < mediaServers.length - 1) setServerIdx((i) => i + 1);
            else { setError('MP4 playback failed'); setLoading(false); onFallback?.(); }
          }, { once: true });
          return;
        }

        // === HLS branch (existing servers) ===
        let proxied = '';
        if (mode.kind === 'anime') {
          const res = await fetch(
            `${FN_BASE}/anime-extract?anilist=${mode.anilistId}&ep=${mode.episode}&type=${mode.audioType}&server=${currentServer}`,
            { headers: { apikey: APIKEY } }
          );
          if (!res.ok) throw new Error(`extract ${res.status}`);
          const payload = await res.json();
          if (!payload?.url) throw new Error('No stream URL');
          proxied = `${FN_BASE}/hls-proxy?url=${encodeURIComponent(payload.url)}&ref=${encodeURIComponent(payload.referer || '')}`;
        } else {
          const inline = buildPlaylistUrl(serverIdx);
          if (!inline) throw new Error('Cannot build playlist');
          proxied = inline;
        }

        if (cancelled) return;
        setPlaylistUrl(proxied);

        const video = videoRef.current;
        if (!video) return;
        const settings = getPlayerSettings();
        video.volume = settings.volume;
        video.muted = settings.muted;
        video.playbackRate = settings.playbackRate;
        if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null; }

        const onReady = () => {
          setLoading(false);
          const saved = getResume(resumeId);
          if (saved && saved.position > 30 && saved.duration > 0 && saved.position < saved.duration * 0.95) {
            setResumePromptAt(saved.position);
          } else {
            video.play().catch(() => {});
          }
        };

        if (Hls.isSupported()) {
          const hls = new Hls({ enableWorker: true, manifestLoadingTimeOut: 12000, manifestLoadingMaxRetry: 1 });
          hlsRef.current = hls;
          hls.loadSource(proxied);
          hls.attachMedia(video);
          hls.on(Hls.Events.MANIFEST_PARSED, onReady);
          hls.on(Hls.Events.ERROR, (_e, data) => {
            if (data.fatal) {
              if ((mode.kind === 'movie' || mode.kind === 'tv') && serverIdx < mediaServers.length - 1) {
                setServerIdx((i) => i + 1);
              } else {
                setError(data.details || 'Playback error');
                setLoading(false);
                onFallback?.();
              }
            }
          });
        } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
          video.src = proxied;
          video.addEventListener('loadedmetadata', onReady, { once: true });
        } else {
          throw new Error('HLS not supported in this browser');
        }
      } catch (e: any) {
        if (!cancelled) {
          setError(e.message || String(e));
          setLoading(false);
        }
      }
    };

    load();
    return () => {
      cancelled = true;
      if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null; }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(mode), serverIdx]);

  // Persist player settings on change + save resume position periodically
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    let lastSave = 0;
    const onVolume = () => savePlayerSettings({ volume: v.volume, muted: v.muted });
    const onRate = () => savePlayerSettings({ playbackRate: v.playbackRate });
    const onTime = () => {
      const now = Date.now();
      if (now - lastSave < 5000) return;
      lastSave = now;
      if (!Number.isFinite(v.duration) || v.duration <= 0) return;
      saveResume({
        id: resumeId,
        kind: mode.kind as ResumeKind,
        title,
        poster,
        tmdbId: 'tmdbId' in mode ? mode.tmdbId : undefined,
        season: 'season' in mode ? mode.season : undefined,
        episode: 'episode' in mode ? mode.episode : undefined,
        malId: mode.kind === 'anime' ? mode.malId : undefined,
        anilistId: mode.kind === 'anime' ? mode.anilistId : undefined,
        animeEpisode: mode.kind === 'anime' ? mode.episode : undefined,
        audioType: mode.kind === 'anime' ? mode.audioType : undefined,
        position: v.currentTime,
        duration: v.duration,
        updatedAt: now,
      });
    };
    v.addEventListener('volumechange', onVolume);
    v.addEventListener('ratechange', onRate);
    v.addEventListener('timeupdate', onTime);
    v.addEventListener('pause', onTime);
    return () => {
      v.removeEventListener('volumechange', onVolume);
      v.removeEventListener('ratechange', onRate);
      v.removeEventListener('timeupdate', onTime);
      v.removeEventListener('pause', onTime);
    };
  }, [resumeId, title, poster, mode]);

  const tryNextServer = () => setServerIdx((i) => i + 1);
  const currentServerLabel =
    mode.kind === 'anime'
      ? animeServers[serverIdx % animeServers.length]
      : mediaServers[serverIdx % mediaServers.length];

  const acceptResume = () => {
    const v = videoRef.current;
    if (v && resumePromptAt != null) v.currentTime = resumePromptAt;
    setResumePromptAt(null);
    v?.play().catch(() => {});
  };
  const dismissResume = () => {
    setResumePromptAt(null);
    videoRef.current?.play().catch(() => {});
  };

  const [dlProgress, setDlProgress] = useState<DLProgress | null>(null);
  const dlAbortRef = useRef<AbortController | null>(null);

  const startDownload = async () => {
    if (!playlistUrl) return;
    if (dlProgress && dlProgress.status !== 'done' && dlProgress.status !== 'error') return;
    const ctrl = new AbortController();
    dlAbortRef.current = ctrl;
    setDlProgress({ done: 0, total: 0, bytes: 0, status: 'parsing' });
    try {
      await downloadHls(playlistUrl, title, setDlProgress, ctrl.signal);
    } catch {
      // progress already set to error
    }
  };
  const cancelDownload = () => {
    dlAbortRef.current?.abort();
    setDlProgress(null);
  };

  const fmt = (s: number) => {
    if (!Number.isFinite(s)) return '';
    const m = Math.floor(s / 60), sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  const dlPct = dlProgress && dlProgress.total > 0
    ? Math.round((dlProgress.done / dlProgress.total) * 100)
    : 0;
  const dlBusy = !!dlProgress && dlProgress.status !== 'done' && dlProgress.status !== 'error';

  return (
    <div className="w-full">
    <div className="relative w-full aspect-video bg-background rounded-xl overflow-hidden border border-border/30 shadow-2xl">
      <video
        ref={videoRef}
        controls
        playsInline
        poster={poster}
        className="w-full h-full bg-black"
        title={title}
      />
      {loading && !error && (
        <div className="absolute inset-0 flex items-center justify-center bg-background/80 pointer-events-none">
          <Loader2 className="w-8 h-8 text-primary animate-spin" />
        </div>
      )}
      {error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-background p-4">
          <AlertCircle className="w-8 h-8 text-destructive" />
          <p className="text-xs text-muted-foreground text-center">Stream failed: {error}</p>
          <div className="flex gap-2 flex-wrap justify-center">
            <button
              onClick={tryNextServer}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-secondary border border-border/30 rounded-lg text-xs font-bold"
            >
              <RefreshCw size={12} /> Try next server
            </button>
            {onFallback && (
              <button
                onClick={onFallback}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground rounded-lg text-xs font-bold"
              >
                Use embed player
              </button>
            )}
          </div>
        </div>
      )}
      {resumePromptAt != null && (
        <div className="absolute bottom-16 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-black/85 backdrop-blur-sm px-3 py-2 rounded-lg border border-border/40 z-30">
          <RotateCcw size={14} className="text-primary" />
          <span className="text-xs text-white">Resume from {fmt(resumePromptAt)}?</span>
          <button onClick={acceptResume} className="px-2 py-1 rounded bg-primary text-primary-foreground text-[10px] font-bold">Resume</button>
          <button onClick={dismissResume} className="px-2 py-1 rounded bg-secondary text-[10px] font-bold">Start over</button>
        </div>
      )}
      <div className="absolute top-2 right-2 flex items-center gap-1 bg-black/60 backdrop-blur-sm px-2 py-1 rounded text-[10px] text-green-400 pointer-events-none">
        <Shield size={10} /> Ad-Free · {currentServerLabel}{mp4Url && mp4Label ? ` · ${mp4Label}` : ''}{mp4Url ? ' · MP4' : ''}
      </div>
    </div>

    {/* Server switcher — switch HLS source to dodge ads/broken streams */}
    {(mode.kind === 'movie' || mode.kind === 'tv') && (
      <div className="mt-3 flex flex-wrap items-center gap-2 bg-secondary/40 border border-border/30 rounded-lg p-3">
        <RefreshCw size={12} className="text-primary shrink-0" />
        <span className="text-xs font-semibold mr-1">Server</span>
        <div className="flex flex-wrap gap-1">
          {mediaServers.map((s, i) => (
            <button
              key={s}
              onClick={() => { if (i !== serverIdx) { setServerIdx(i); } }}
              className={`px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wide transition-all ${
                i === serverIdx
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-background border border-border/30 text-muted-foreground hover:text-foreground'
              }`}
            >
              {s}
            </button>
          ))}
        </div>
        {loading && <Loader2 className="w-3 h-3 animate-spin text-primary ml-auto" />}
        {!loading && !error && <span className="ml-auto text-[10px] text-green-500 font-bold">● Playing</span>}
      </div>
    )}

    {/* Download bar — rendered OUTSIDE the video so taps are never eaten by native controls */}
    {playlistUrl && !error && (
      <div className="mt-3 flex flex-col gap-2 bg-secondary/40 border border-border/30 rounded-lg p-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-xs text-muted-foreground min-w-0">
            <Download size={14} className="text-primary shrink-0" />
            <span className="truncate">
              {dlProgress ? (
                dlProgress.status === 'parsing' ? 'Preparing download…' :
                dlProgress.status === 'downloading' ? `Downloading ${dlPct}%` :
                dlProgress.status === 'finalizing' ? 'Finalizing file…' :
                dlProgress.status === 'verifying' ? 'Verifying file…' :
                dlProgress.status === 'done' ? `Saved ✓ ${dlProgress.filename} · ${((dlProgress.blobSize ?? 0)/1024/1024).toFixed(1)} MB · ${((dlProgress.durationMs ?? 0)/1000).toFixed(1)}s` :
                dlProgress.status === 'error' ? `Failed: ${dlProgress.message}` : ''
              ) : 'Download as a single .ts file (plays in VLC, MX Player, any modern player)'}
            </span>
          </div>
          {dlBusy ? (
            <button
              onClick={cancelDownload}
              className="flex items-center gap-1 px-3 py-1.5 bg-destructive text-destructive-foreground rounded-md text-xs font-bold shrink-0"
            >
              <X size={12} /> Cancel
            </button>
          ) : (
            <button
              onClick={startDownload}
              className="flex items-center gap-1 px-3 py-1.5 bg-primary text-primary-foreground rounded-md text-xs font-bold shrink-0 hover:opacity-90 active:scale-95 transition"
            >
              <Download size={12} /> {dlProgress?.status === 'done' ? 'Download again' : 'Download'}
            </button>
          )}
        </div>
        {dlProgress && dlProgress.total > 0 && (
          <>
            <div className="h-2 bg-background rounded-full overflow-hidden">
              <div className="h-full bg-primary transition-all" style={{ width: `${dlPct}%` }} />
            </div>
            <div className="text-[10px] text-muted-foreground">
              {dlProgress.done}/{dlProgress.total} segments · {(dlProgress.bytes / 1024 / 1024).toFixed(1)} MB
            </div>
          </>
        )}
      </div>
    )}
    </div>
  );
};

export default NativeMediaPlayer;
