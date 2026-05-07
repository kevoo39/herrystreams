import React, { useEffect, useRef, useState } from 'react';
import Hls from 'hls.js';
import { AlertCircle, Loader2, RefreshCw, Shield, Download } from 'lucide-react';

type Mode =
  | { kind: 'anime'; anilistId: number; episode: number; audioType: 'sub' | 'dub'; server?: 'aniwave' | 'anitaku' }
  | { kind: 'movie'; tmdbId: number; server?: string }
  | { kind: 'tv'; tmdbId: number; season: number; episode: number; server?: string };

interface NativeMediaPlayerProps {
  mode: Mode;
  title: string;
  onFallback?: () => void;
}

const FN_BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;
const PROXY_BASE = `${FN_BASE}/hls-proxy`;
const APIKEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

const NativeMediaPlayer: React.FC<NativeMediaPlayerProps> = ({ mode, title, onFallback }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [streamUrl, setStreamUrl] = useState<string | null>(null);
  const [streamReferer, setStreamReferer] = useState<string>('');

  // Server fallback rotation
  const animeServers: ('aniwave' | 'anitaku')[] = ['aniwave', 'anitaku'];
  const mediaServers = ['allmovies', 'moviebox', 'catflix', 'flixhq', 'vidlink'];
  const [animeServerIdx, setAnimeServerIdx] = useState(0);
  const [mediaServerIdx, setMediaServerIdx] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setStreamUrl(null);

    const load = async () => {
      try {
        let url = '';
        if (mode.kind === 'anime') {
          const server = animeServers[animeServerIdx];
          url = `${FN_BASE}/anime-extract?anilist=${mode.anilistId}&ep=${mode.episode}&type=${mode.audioType}&server=${server}`;
        } else if (mode.kind === 'movie') {
          const server = mediaServers[mediaServerIdx];
          url = `${FN_BASE}/media-extract?type=movie&tmdb=${mode.tmdbId}&server=${server}`;
        } else {
          const server = mediaServers[mediaServerIdx];
          url = `${FN_BASE}/media-extract?type=tv&tmdb=${mode.tmdbId}&season=${mode.season}&episode=${mode.episode}&server=${server}`;
        }

        const res = await fetch(url, { headers: { apikey: APIKEY } });
        if (!res.ok) throw new Error(`extract ${res.status}`);
        const payload = await res.json();
        if (cancelled) return;
        if (!payload?.url) throw new Error('No stream URL');

        const proxied = `${PROXY_BASE}?url=${encodeURIComponent(payload.url)}&ref=${encodeURIComponent(payload.referer || '')}`;
        setStreamUrl(proxied);
        setStreamReferer(payload.referer || '');

        const video = videoRef.current;
        if (!video) return;

        if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null; }

        if (Hls.isSupported()) {
          const hls = new Hls({ enableWorker: true });
          hlsRef.current = hls;
          hls.loadSource(proxied);
          hls.attachMedia(video);
          hls.on(Hls.Events.MANIFEST_PARSED, () => {
            setLoading(false);
            video.play().catch(() => {});
          });
          hls.on(Hls.Events.ERROR, (_e, data) => {
            if (data.fatal) {
              setError(data.details || 'Playback error');
              setLoading(false);
            }
          });
        } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
          video.src = proxied;
          video.addEventListener('loadedmetadata', () => setLoading(false), { once: true });
          video.play().catch(() => {});
        } else {
          throw new Error('HLS not supported');
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
  }, [JSON.stringify(mode), animeServerIdx, mediaServerIdx]);

  const tryNextServer = () => {
    if (mode.kind === 'anime') {
      setAnimeServerIdx((i) => (i + 1) % animeServers.length);
    } else {
      setMediaServerIdx((i) => (i + 1) % mediaServers.length);
    }
  };

  const currentServerLabel =
    mode.kind === 'anime' ? animeServers[animeServerIdx] : mediaServers[mediaServerIdx];

  return (
    <div className="relative w-full aspect-video bg-background rounded-xl overflow-hidden border border-border/30 shadow-2xl">
      <video
        ref={videoRef}
        controls
        playsInline
        className="w-full h-full bg-black"
        crossOrigin="anonymous"
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
      <div className="absolute top-2 right-2 flex items-center gap-1 bg-black/60 backdrop-blur-sm px-2 py-1 rounded text-[10px] text-green-400 pointer-events-none">
        <Shield size={10} /> Ad-Free · {currentServerLabel}
      </div>
      {streamUrl && !error && (
        <a
          href={streamUrl}
          download={`${title.replace(/[^a-z0-9]+/gi, '_')}.m3u8`}
          className="absolute top-2 left-2 flex items-center gap-1 bg-black/60 backdrop-blur-sm px-2 py-1 rounded text-[10px] text-white hover:bg-primary transition-colors"
          title="Download stream playlist (.m3u8). Use a tool like VLC or yt-dlp to save as MP4."
        >
          <Download size={10} /> Download
        </a>
      )}
    </div>
  );
};

export default NativeMediaPlayer;
