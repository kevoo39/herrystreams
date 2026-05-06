import React, { useEffect, useRef, useState } from 'react';
import Hls from 'hls.js';
import { AlertCircle, Loader2, RefreshCw, Shield } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

interface NativeAnimePlayerProps {
  anilistId: number;
  episode: number;
  audioType: 'sub' | 'dub';
  title: string;
  onFallback?: () => void;
}

const FN_BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;
const PROXY_BASE = `${FN_BASE}/hls-proxy`;

const NativeAnimePlayer: React.FC<NativeAnimePlayerProps> = ({
  anilistId, episode, audioType, title, onFallback,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [server, setServer] = useState<'aniwave' | 'anitaku'>('aniwave');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    const load = async () => {
      try {
        const { data, error: fnErr } = await supabase.functions.invoke('anime-extract', {
          method: 'GET',
          // workaround: invoke doesn't accept query, use raw URL
        }).catch(() => ({ data: null, error: 'invoke-failed' as any }));

        // Fallback: direct fetch (functions.invoke doesn't take query strings)
        let payload: any = data;
        if (!payload || fnErr) {
          const res = await fetch(
            `${FN_BASE}/anime-extract?anilist=${anilistId}&ep=${episode}&type=${audioType}&server=${server}`,
            { headers: { apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY } },
          );
          if (!res.ok) throw new Error(`extract ${res.status}`);
          payload = await res.json();
        }

        if (cancelled) return;
        if (!payload?.url) throw new Error('No stream URL');

        const proxied = `${PROXY_BASE}?url=${encodeURIComponent(payload.url)}&ref=${encodeURIComponent(payload.referer || '')}`;

        const video = videoRef.current;
        if (!video) return;

        // Cleanup previous
        if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null; }

        if (Hls.isSupported()) {
          const hls = new Hls({ enableWorker: true, lowLatencyMode: false });
          hlsRef.current = hls;
          hls.loadSource(proxied);
          hls.attachMedia(video);
          hls.on(Hls.Events.MANIFEST_PARSED, () => {
            setLoading(false);
            video.play().catch(() => {});
          });
          hls.on(Hls.Events.ERROR, (_e, data) => {
            if (data.fatal) {
              console.error('HLS fatal', data);
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
  }, [anilistId, episode, audioType, server]);

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
          <p className="text-xs text-muted-foreground text-center">Direct stream failed: {error}</p>
          <div className="flex gap-2">
            <button
              onClick={() => { setServer(s => s === 'aniwave' ? 'anitaku' : 'aniwave'); }}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-secondary border border-border/30 rounded-lg text-xs font-bold"
            >
              <RefreshCw size={12} /> Try {server === 'aniwave' ? 'Anitaku' : 'Aniwave'}
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
        <Shield size={10} /> Ad-Free Stream
      </div>
    </div>
  );
};

export default NativeAnimePlayer;
