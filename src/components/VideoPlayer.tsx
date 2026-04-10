import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Server, AlertCircle, Loader2, SkipForward, RefreshCw, Shield } from 'lucide-react';
import { getServers, getMovieStreamUrl, getTVStreamUrl, getAnimeStreamUrl, type AudioType } from '@/lib/vidnest';
import { malToAnilistId } from '@/lib/malToAnilist';

interface VideoPlayerProps {
  tmdbId?: number;
  season?: number;
  episode?: number;
  malId?: string;
  animeEpisode?: number;
  title: string;
  type: 'movie' | 'tv' | 'anime';
  totalEpisodes?: number;
  onNextEpisode?: () => void;
  onClose?: () => void;
}

const ALLOWED_DOMAINS = ['vidnest.fun', 'vidsrc.to', '2anime.xyz'];

const VideoPlayer: React.FC<VideoPlayerProps> = ({
  tmdbId, season, episode, malId, animeEpisode,
  title, type, totalEpisodes, onNextEpisode, onClose
}) => {
  const [audioType, setAudioType] = useState<AudioType>('sub');
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [anilistId, setAnilistId] = useState<number | null>(null);
  const [idLoading, setIdLoading] = useState(type === 'anime');
  const [currentServerIndex, setCurrentServerIndex] = useState(0);
  const [overlayActive, setOverlayActive] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const servers = getServers();

  // Block popups globally while player is mounted
  useEffect(() => {
    const originalOpen = window.open;
    window.open = () => null;

    // Block navigation attempts from iframes
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      // Only prevent if it's from an iframe trying to navigate the parent
    };

    // Intercept click events on ad overlay links
    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const link = target.closest('a');
      if (link && link.href && !ALLOWED_DOMAINS.some(d => link.href.includes(d))) {
        e.preventDefault();
        e.stopPropagation();
      }
    };

    document.addEventListener('click', handleClick, true);

    return () => {
      window.open = originalOpen;
      document.removeEventListener('click', handleClick, true);
    };
  }, []);

  // Block iframe navigation attempts via message events
  useEffect(() => {
    const handleMessage = (e: MessageEvent) => {
      // Only accept messages from allowed domains
      if (e.origin && !ALLOWED_DOMAINS.some(d => e.origin.includes(d))) {
        return;
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  useEffect(() => {
    if (type === 'anime' && malId) {
      setIdLoading(true);
      setHasError(false);
      malToAnilistId(malId).then((id) => {
        setAnilistId(id);
        setIdLoading(false);
        if (!id) setHasError(true);
      });
    }
  }, [malId, type]);

  useEffect(() => {
    setIsLoading(true);
    setHasError(false);
    setCurrentServerIndex(0);
  }, [episode, animeEpisode, tmdbId]);

  const handleServerSwitch = useCallback(() => {
    setCurrentServerIndex((prev) => {
      const next = (prev + 1) % servers.length;
      setIsLoading(true);
      setHasError(false);
      return next;
    });
  }, [servers.length]);

  const handleIframeError = useCallback(() => {
    setIsLoading(false);
    if (currentServerIndex < servers.length - 1) {
      setCurrentServerIndex((prev) => prev + 1);
      setIsLoading(true);
    } else {
      setHasError(true);
    }
  }, [currentServerIndex, servers.length]);

  const handleIframeLoad = useCallback(() => {
    setIsLoading(false);
    // Temporarily show overlay to catch initial ad clicks, then hide for interaction
    setOverlayActive(true);
    setTimeout(() => setOverlayActive(false), 1500);
  }, []);

  const handleOverlayClick = useCallback(() => {
    // User clicked the overlay - pass through to iframe by hiding overlay
    setOverlayActive(false);
  }, []);

  let embedUrl = '';
  if (type === 'movie' && tmdbId) {
    embedUrl = getMovieStreamUrl(tmdbId, currentServerIndex);
  } else if (type === 'tv' && tmdbId && season && episode) {
    embedUrl = getTVStreamUrl(tmdbId, season, episode, currentServerIndex);
  } else if (type === 'anime' && anilistId && animeEpisode) {
    embedUrl = getAnimeStreamUrl(anilistId, animeEpisode, audioType, currentServerIndex);
  }

  const currentEp = type === 'anime' ? animeEpisode : episode;

  return (
    <div className="flex flex-col gap-3 w-full">
      <div className="relative w-full aspect-video bg-background rounded-xl overflow-hidden border border-border/30 shadow-2xl">
        {(isLoading || idLoading) && !hasError && (
          <div className="absolute inset-0 flex items-center justify-center z-10 bg-background">
            <Loader2 className="w-8 h-8 text-primary animate-spin" />
          </div>
        )}

        {hasError && (
          <div className="absolute inset-0 flex flex-col items-center justify-center z-10 bg-background gap-3">
            <AlertCircle className="w-8 h-8 text-destructive" />
            <p className="text-xs text-muted-foreground text-center px-4">
              {anilistId || type !== 'anime' ? 'All servers failed. Try switching audio or retry.' : 'Could not resolve ID for this anime.'}
            </p>
            <button
              onClick={() => { setCurrentServerIndex(0); setIsLoading(true); setHasError(false); }}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground rounded-lg text-xs font-bold hover:brightness-110 transition-all"
            >
              <RefreshCw size={12} />
              Retry
            </button>
          </div>
        )}

        {/* Ad-blocking overlay - catches initial redirect clicks */}
        {overlayActive && (
          <div
            className="absolute inset-0 z-20 cursor-pointer"
            onClick={handleOverlayClick}
            style={{ background: 'transparent' }}
          />
        )}

        {embedUrl && (
          <iframe
            ref={iframeRef}
            key={embedUrl}
            src={embedUrl}
            className="w-full h-full"
            allowFullScreen
            allow="autoplay; fullscreen; encrypted-media"
            frameBorder="0"
            title={title}
            onLoad={handleIframeLoad}
            onError={handleIframeError}
          />
        )}
      </div>

      {/* Controls bar */}
      <div className="flex flex-col gap-2 p-3 bg-secondary/30 border border-border/30 rounded-xl">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {type === 'anime' && (
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <Server size={12} className="text-primary shrink-0" />
                <span className="text-xs font-semibold">Audio</span>
              </div>
              <div className="flex bg-background p-0.5 rounded-lg border border-border/30">
                {(['sub', 'dub'] as AudioType[]).map((t) => (
                  <button
                    key={t}
                    onClick={() => { setAudioType(t); setIsLoading(true); setHasError(false); }}
                    className={`px-3 py-1.5 rounded-md text-[10px] font-bold uppercase transition-all ${
                      audioType === t ? 'bg-primary text-primary-foreground' : 'hover:bg-secondary text-muted-foreground'
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2">
              <RefreshCw size={12} className="text-primary shrink-0" />
              <span className="text-xs font-semibold">Server</span>
            </div>
            <div className="flex bg-background p-0.5 rounded-lg border border-border/30">
              {servers.map((server, idx) => (
                <button
                  key={server.name}
                  onClick={() => { setCurrentServerIndex(idx); setIsLoading(true); setHasError(false); }}
                  className={`px-2.5 py-1.5 rounded-md text-[10px] font-bold transition-all ${
                    currentServerIndex === idx ? 'bg-primary text-primary-foreground' : 'hover:bg-secondary text-muted-foreground'
                  }`}
                >
                  {server.name}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <Shield size={10} className="text-green-500" />
            <span>Ad Protection</span>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2">
          {onNextEpisode && totalEpisodes && currentEp && currentEp < totalEpisodes && (
            <button
              onClick={onNextEpisode}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground rounded-lg text-xs font-bold hover:brightness-110 transition-all"
            >
              <SkipForward size={12} />
              Next Episode
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default VideoPlayer;