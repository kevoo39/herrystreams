import React, { useState, useCallback, useEffect, useMemo } from 'react';
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

const ALLOWED_STREAM_HOSTS = ['vidnest.fun', 'vidsrc.to', '2anime.xyz'];

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const buildProtectedEmbedDocument = ({
  frameId,
  src,
  title,
}: {
  frameId: string;
  src: string;
  title: string;
}) => {
  const allowedSources = [
    'https://vidnest.fun',
    'https://*.vidnest.fun',
    'https://vidsrc.to',
    'https://*.vidsrc.to',
    'https://2anime.xyz',
    'https://*.2anime.xyz',
  ];

  const csp = [
    "default-src 'none'",
    `frame-src ${allowedSources.join(' ')}`,
    `child-src ${allowedSources.join(' ')}`,
    "script-src 'unsafe-inline'",
    "style-src 'unsafe-inline'",
    'img-src https: data:',
    `connect-src ${allowedSources.join(' ')}`,
    'media-src https: blob:',
    'font-src data:',
    "base-uri 'none'",
    "form-action 'none'",
    `navigate-to ${allowedSources.join(' ')}`,
  ].join('; ');

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta http-equiv="Content-Security-Policy" content="${csp}" />
    <style>
      :root {
        color-scheme: dark;
      }

      html, body {
        width: 100%;
        height: 100%;
        margin: 0;
        overflow: hidden;
        background: hsl(var(--background, 0 0% 6%));
      }

      body {
        font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }

      .shell {
        position: relative;
        width: 100%;
        height: 100%;
        background: hsl(var(--background, 0 0% 6%));
      }

      #stream {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        border: 0;
        background: #000;
        pointer-events: none;
      }

      #badge {
        position: absolute;
        top: 12px;
        right: 12px;
        z-index: 3;
        padding: 6px 10px;
        border-radius: 999px;
        border: 1px solid hsl(var(--border, 0 0% 20%) / 0.8);
        background: hsl(var(--background, 0 0% 8%) / 0.82);
        color: hsl(var(--foreground, 0 0% 98%));
        font-size: 11px;
        font-weight: 700;
        line-height: 1;
        backdrop-filter: blur(12px);
      }

      #shield {
        position: absolute;
        inset: 0;
        z-index: 2;
        display: flex;
        align-items: flex-end;
        justify-content: center;
        padding: 16px;
        background: linear-gradient(to top, hsl(var(--background, 0 0% 6%) / 0.78), transparent 48%);
      }

      #panel {
        width: min(340px, 100%);
        padding: 14px;
        border-radius: 18px;
        border: 1px solid hsl(var(--border, 0 0% 20%) / 0.85);
        background: hsl(var(--background, 0 0% 8%) / 0.92);
        color: hsl(var(--foreground, 0 0% 98%));
        box-shadow: 0 20px 60px rgba(0, 0, 0, 0.35);
        backdrop-filter: blur(14px);
      }

      .eyebrow {
        margin: 0 0 6px;
        color: hsl(var(--muted-foreground, 0 0% 72%));
        font-size: 11px;
        font-weight: 800;
        letter-spacing: 0.14em;
        text-transform: uppercase;
      }

      .title {
        margin: 0 0 8px;
        font-size: 14px;
        font-weight: 700;
      }

      .copy {
        margin: 0;
        color: hsl(var(--muted-foreground, 0 0% 72%));
        font-size: 12px;
        line-height: 1.45;
      }

      .actions {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
        margin-top: 12px;
      }

      button {
        appearance: none;
        border: 0;
        border-radius: 999px;
        padding: 10px 14px;
        font-size: 12px;
        font-weight: 800;
        cursor: pointer;
      }

      #unlock {
        background: hsl(var(--primary, 0 72% 51%));
        color: hsl(var(--primary-foreground, 0 0% 98%));
      }

      #relock {
        border: 1px solid hsl(var(--border, 0 0% 20%) / 0.85);
        background: hsl(var(--secondary, 0 0% 14%));
        color: hsl(var(--secondary-foreground, 0 0% 98%));
      }

      body.is-unlocked #shield {
        background: transparent;
        pointer-events: none;
      }

      body.is-unlocked #panel {
        opacity: 0;
        transform: translateY(10px);
      }

      #panel,
      #shield {
        transition: opacity 180ms ease, transform 180ms ease, background 180ms ease;
      }
    </style>
  </head>
  <body>
    <div class="shell">
      <div id="badge">Protection locked</div>
      <iframe
        id="stream"
        src="${escapeHtml(src)}"
        title="${escapeHtml(title)}"
        allow="autoplay; fullscreen; encrypted-media"
        allowfullscreen
        referrerpolicy="origin"
      ></iframe>
      <div id="shield">
        <div id="panel">
          <p class="eyebrow">Protected Mode</p>
          <p class="title">${escapeHtml(title)}</p>
          <p class="copy">Player clicks stay blocked until you unlock controls, then KevNest relocks them after 8 seconds to cut down fake play ads and redirects.</p>
          <div class="actions">
            <button id="unlock" type="button">Enable controls</button>
            <button id="relock" type="button" hidden>Relock now</button>
          </div>
        </div>
      </div>
    </div>

    <script>
      (() => {
        const frameId = ${JSON.stringify(frameId)};
        const allowedHosts = ${JSON.stringify(ALLOWED_STREAM_HOSTS)};
        const root = document.body;
        const stream = document.getElementById('stream');
        const badge = document.getElementById('badge');
        const shield = document.getElementById('shield');
        const unlockButton = document.getElementById('unlock');
        const relockButton = document.getElementById('relock');
        let relockTimer = 0;
        let hasLoaded = false;

        const postToParent = (type, extra = {}) => {
          parent.postMessage({ source: 'kevnest-protected-embed', frameId, type, ...extra }, '*');
        };

        const isAllowedUrl = (value) => {
          try {
            const parsed = new URL(value, window.location.href);
            return allowedHosts.some((host) => parsed.hostname === host || parsed.hostname.endsWith('.' + host));
          } catch (error) {
            return false;
          }
        };

        const lock = () => {
          root.classList.remove('is-unlocked');
          stream.style.pointerEvents = 'none';
          badge.textContent = 'Protection locked';
          unlockButton.hidden = false;
          relockButton.hidden = true;
          window.clearTimeout(relockTimer);
          postToParent('locked');
        };

        const unlock = () => {
          root.classList.add('is-unlocked');
          stream.style.pointerEvents = 'auto';
          badge.textContent = 'Controls live · 8s';
          unlockButton.hidden = true;
          relockButton.hidden = false;
          window.clearTimeout(relockTimer);
          relockTimer = window.setTimeout(lock, 8000);
          postToParent('unlocked');
        };

        window.open = () => null;

        document.addEventListener(
          'click',
          (event) => {
            const target = event.target;
            if (!(target instanceof Element)) return;

            const link = target.closest('a');
            if (link && link.href && !isAllowedUrl(link.href)) {
              event.preventDefault();
              event.stopPropagation();
              lock();
              postToParent('blocked', { href: link.href });
            }
          },
          true,
        );

        shield.addEventListener('click', (event) => {
          if (event.target === shield) {
            event.preventDefault();
            event.stopPropagation();
          }
        });

        unlockButton.addEventListener('click', (event) => {
          event.preventDefault();
          event.stopPropagation();
          unlock();
        });

        relockButton.addEventListener('click', (event) => {
          event.preventDefault();
          event.stopPropagation();
          lock();
        });

        window.addEventListener('blur', () => {
          window.setTimeout(lock, 80);
        });

        document.addEventListener('visibilitychange', () => {
          if (document.hidden) {
            lock();
          }
        });

        stream.addEventListener('load', () => {
          if (!hasLoaded) {
            hasLoaded = true;
            postToParent('loaded');
          }
          lock();
        });

        stream.addEventListener('error', () => {
          postToParent('error');
        });

        window.setTimeout(() => {
          if (!hasLoaded) {
            postToParent('loaded');
          }
        }, 3500);
      })();
    </script>
  </body>
</html>`;
};

const VideoPlayer: React.FC<VideoPlayerProps> = ({
  tmdbId,
  season,
  episode,
  malId,
  animeEpisode,
  title,
  type,
  totalEpisodes,
  onNextEpisode,
}) => {
  const [audioType, setAudioType] = useState<AudioType>('sub');
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [anilistId, setAnilistId] = useState<number | null>(null);
  const [idLoading, setIdLoading] = useState(type === 'anime');
  const [currentServerIndex, setCurrentServerIndex] = useState(0);
  const [protectionState, setProtectionState] = useState<'locked' | 'unlocked'>('locked');
  const [frameId] = useState(() => `kevnest-player-${Math.random().toString(36).slice(2)}`);
  const servers = getServers();

  useEffect(() => {
    const originalOpen = window.open;
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };

    window.open = () => null;
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.open = originalOpen;
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, []);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const payload = event.data;
      if (!payload || payload.source !== 'kevnest-protected-embed' || payload.frameId !== frameId) {
        return;
      }

      if (payload.type === 'loaded') {
        setIsLoading(false);
        setHasError(false);
      }

      if (payload.type === 'error') {
        setIsLoading(false);
        setHasError(true);
      }

      if (payload.type === 'locked') {
        setProtectionState('locked');
      }

      if (payload.type === 'unlocked') {
        setProtectionState('unlocked');
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [frameId]);

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
    setProtectionState('locked');
  }, [episode, animeEpisode, tmdbId]);

  const handleIframeError = useCallback(() => {
    setIsLoading(false);
    if (currentServerIndex < servers.length - 1) {
      setCurrentServerIndex((prev) => prev + 1);
      setIsLoading(true);
      setProtectionState('locked');
    } else {
      setHasError(true);
    }
  }, [currentServerIndex, servers.length]);

  let embedUrl = '';
  if (type === 'movie' && tmdbId) {
    embedUrl = getMovieStreamUrl(tmdbId, currentServerIndex);
  } else if (type === 'tv' && tmdbId && season && episode) {
    embedUrl = getTVStreamUrl(tmdbId, season, episode, currentServerIndex);
  } else if (type === 'anime' && anilistId && animeEpisode) {
    embedUrl = getAnimeStreamUrl(anilistId, animeEpisode, audioType, currentServerIndex);
  }

  const protectedEmbedDocument = useMemo(() => {
    if (!embedUrl) return '';
    return buildProtectedEmbedDocument({ frameId, src: embedUrl, title });
  }, [embedUrl, frameId, title]);

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
              {anilistId || type !== 'anime' ? 'All servers failed. Try another server or retry.' : 'Could not resolve ID for this anime.'}
            </p>
            <button
              onClick={() => {
                setCurrentServerIndex(0);
                setIsLoading(true);
                setHasError(false);
                setProtectionState('locked');
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground rounded-lg text-xs font-bold hover:brightness-110 transition-all"
            >
              <RefreshCw size={12} />
              Retry
            </button>
          </div>
        )}

        {protectedEmbedDocument && (
          <iframe
            key={embedUrl}
            srcDoc={protectedEmbedDocument}
            className="w-full h-full"
            allowFullScreen
            allow="autoplay; fullscreen; encrypted-media"
            frameBorder="0"
            title={title}
            onError={handleIframeError}
          />
        )}
      </div>

      <div className="flex flex-col gap-2 p-3 bg-secondary/30 border border-border/30 rounded-xl">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {type === 'anime' && (
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <Server size={12} className="text-primary shrink-0" />
                <span className="text-xs font-semibold">Audio</span>
              </div>
              <div className="flex bg-background p-0.5 rounded-lg border border-border/30">
                {(['sub', 'dub'] as AudioType[]).map((streamAudioType) => (
                  <button
                    key={streamAudioType}
                    onClick={() => {
                      setAudioType(streamAudioType);
                      setIsLoading(true);
                      setHasError(false);
                      setProtectionState('locked');
                    }}
                    className={`px-3 py-1.5 rounded-md text-[10px] font-bold uppercase transition-all ${
                      audioType === streamAudioType ? 'bg-primary text-primary-foreground' : 'hover:bg-secondary text-muted-foreground'
                    }`}
                  >
                    {streamAudioType}
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
                  onClick={() => {
                    setCurrentServerIndex(idx);
                    setIsLoading(true);
                    setHasError(false);
                    setProtectionState('locked');
                  }}
                  className={`px-2.5 py-1.5 rounded-md text-[10px] font-bold transition-all ${
                    currentServerIndex === idx ? 'bg-primary text-primary-foreground' : 'hover:bg-secondary text-muted-foreground'
                  }`}
                >
                  {server.name}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-[10px] font-semibold text-muted-foreground">
            <Shield size={12} className="text-primary shrink-0" />
            <span>
              {protectionState === 'locked'
                ? 'Click shield is locked until you enable controls'
                : 'Controls are live for 8 seconds, then protection relocks'}
            </span>
          </div>

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
