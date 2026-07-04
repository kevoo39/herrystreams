import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Play, Pause, RotateCcw, RotateCw, Volume2, VolumeX, Volume1,
  Maximize, Minimize, Shield, PictureInPicture2, Loader2,
} from 'lucide-react';

interface KevStreamControlsProps {
  videoRef: React.RefObject<HTMLVideoElement>;
  containerRef: React.RefObject<HTMLDivElement>;
  title: string;
  badge?: string;
}

const RATES = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];

const fmt = (s: number) => {
  if (!Number.isFinite(s) || s < 0) return '0:00';
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60).toString().padStart(2, '0');
  return h > 0 ? `${h}:${m.toString().padStart(2, '0')}:${sec}` : `${m}:${sec}`;
};

const KevStreamControls: React.FC<KevStreamControlsProps> = ({
  videoRef, containerRef, title, badge,
}) => {
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [rate, setRate] = useState(1);
  const [fullscreen, setFullscreen] = useState(false);
  const [pip, setPip] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const [visible, setVisible] = useState(true);
  const [seekPreview, setSeekPreview] = useState<{ x: number; t: number } | null>(null);
  const [flash, setFlash] = useState<null | 'back' | 'fwd'>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);
  const lastTapRef = useRef<{ t: number; x: number } | null>(null);

  const scheduleHide = useCallback(() => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => {
      const v = videoRef.current;
      if (v && !v.paused && !draggingRef.current) setVisible(false);
    }, 3000);
  }, [videoRef]);

  const poke = useCallback(() => {
    setVisible(true);
    scheduleHide();
  }, [scheduleHide]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const onPlay = () => { setPlaying(true); scheduleHide(); };
    const onPause = () => { setPlaying(false); setVisible(true); };
    const onTime = () => { if (!draggingRef.current) setTime(v.currentTime); };
    const onDur = () => setDuration(v.duration || 0);
    const onProg = () => {
      try {
        if (v.buffered.length) setBuffered(v.buffered.end(v.buffered.length - 1));
      } catch { /* ignore */ }
    };
    const onVol = () => { setMuted(v.muted); setVolume(v.volume); };
    const onRate = () => setRate(v.playbackRate);
    const onWaiting = () => setWaiting(true);
    const onPlaying = () => setWaiting(false);
    const onCanPlay = () => setWaiting(false);
    v.addEventListener('play', onPlay);
    v.addEventListener('pause', onPause);
    v.addEventListener('timeupdate', onTime);
    v.addEventListener('durationchange', onDur);
    v.addEventListener('loadedmetadata', onDur);
    v.addEventListener('progress', onProg);
    v.addEventListener('volumechange', onVol);
    v.addEventListener('ratechange', onRate);
    v.addEventListener('waiting', onWaiting);
    v.addEventListener('playing', onPlaying);
    v.addEventListener('canplay', onCanPlay);
    setPlaying(!v.paused);
    setDuration(v.duration || 0);
    setMuted(v.muted);
    setVolume(v.volume);
    setRate(v.playbackRate);
    return () => {
      v.removeEventListener('play', onPlay);
      v.removeEventListener('pause', onPause);
      v.removeEventListener('timeupdate', onTime);
      v.removeEventListener('durationchange', onDur);
      v.removeEventListener('loadedmetadata', onDur);
      v.removeEventListener('progress', onProg);
      v.removeEventListener('volumechange', onVol);
      v.removeEventListener('ratechange', onRate);
      v.removeEventListener('waiting', onWaiting);
      v.removeEventListener('playing', onPlaying);
      v.removeEventListener('canplay', onCanPlay);
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, [videoRef, scheduleHide]);

  useEffect(() => {
    const onFs = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onFs);
    return () => document.removeEventListener('fullscreenchange', onFs);
  }, []);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const onEnter = () => setPip(true);
    const onLeave = () => setPip(false);
    v.addEventListener('enterpictureinpicture', onEnter);
    v.addEventListener('leavepictureinpicture', onLeave);
    return () => {
      v.removeEventListener('enterpictureinpicture', onEnter);
      v.removeEventListener('leavepictureinpicture', onLeave);
    };
  }, [videoRef]);

  const togglePlay = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) v.play().catch(() => {});
    else v.pause();
    poke();
  }, [videoRef, poke]);

  const skip = useCallback((delta: number) => {
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = Math.max(0, Math.min((v.duration || Infinity), v.currentTime + delta));
    setFlash(delta < 0 ? 'back' : 'fwd');
    setTimeout(() => setFlash(null), 400);
    poke();
  }, [videoRef, poke]);

  const toggleMute = () => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = !v.muted;
    poke();
  };

  const setVol = (val: number) => {
    const v = videoRef.current;
    if (!v) return;
    const clamped = Math.max(0, Math.min(1, val));
    v.volume = clamped;
    if (clamped > 0 && v.muted) v.muted = false;
    poke();
  };

  const cycleRate = () => {
    const v = videoRef.current;
    if (!v) return;
    const i = RATES.indexOf(v.playbackRate);
    v.playbackRate = RATES[(i + 1) % RATES.length] ?? 1;
    poke();
  };

  const togglePip = async () => {
    const v = videoRef.current as any;
    if (!v || !document.pictureInPictureEnabled) return;
    try {
      if (document.pictureInPictureElement) await (document as any).exitPictureInPicture();
      else await v.requestPictureInPicture?.();
    } catch { /* ignore */ }
    poke();
  };

  const toggleFullscreen = async () => {
    const el = containerRef.current;
    const v = videoRef.current as any;
    if (!el) return;
    try {
      if (document.fullscreenElement) {
        try { (screen.orientation as any)?.unlock?.(); } catch { /* ignore */ }
        await document.exitFullscreen().catch(() => {});
      } else if (el.requestFullscreen) {
        await el.requestFullscreen().catch(() => {});
        try { await (screen.orientation as any)?.lock?.('landscape'); } catch { /* ignore */ }
      } else if (v?.webkitEnterFullscreen) {
        v.webkitEnterFullscreen();
      }
    } catch { /* ignore */ }
    poke();
  };

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tgt = e.target as HTMLElement;
      if (tgt && (tgt.tagName === 'INPUT' || tgt.tagName === 'TEXTAREA' || tgt.isContentEditable)) return;
      const v = videoRef.current;
      if (!v) return;
      switch (e.key.toLowerCase()) {
        case ' ':
        case 'k': e.preventDefault(); togglePlay(); break;
        case 'arrowright': e.preventDefault(); skip(10); break;
        case 'arrowleft': e.preventDefault(); skip(-10); break;
        case 'j': skip(-10); break;
        case 'l': skip(10); break;
        case 'arrowup': e.preventDefault(); setVol(v.volume + 0.05); break;
        case 'arrowdown': e.preventDefault(); setVol(v.volume - 0.05); break;
        case 'm': toggleMute(); break;
        case 'f': toggleFullscreen(); break;
        case 'p': togglePip(); break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [togglePlay, skip]);

  const seekFromPointer = (clientX: number) => {
    const bar = barRef.current;
    const v = videoRef.current;
    if (!bar || !v || !duration) return;
    const rect = bar.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    setTime(pct * duration);
    v.currentTime = pct * duration;
  };

  const onBarPointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    draggingRef.current = true;
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    seekFromPointer(e.clientX);
  };
  const onBarPointerMove = (e: React.PointerEvent) => {
    if (!barRef.current || !duration) return;
    const rect = barRef.current.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    setSeekPreview({ x: e.clientX - rect.left, t: pct * duration });
    if (draggingRef.current) seekFromPointer(e.clientX);
  };
  const onBarPointerUp = () => {
    draggingRef.current = false;
    poke();
  };
  const onBarLeave = () => setSeekPreview(null);

  // Double-tap zones (mobile): left = -10s, right = +10s
  const handleSurfaceTap = (e: React.MouseEvent) => {
    if (e.target !== e.currentTarget) return;
    const now = Date.now();
    const last = lastTapRef.current;
    const el = e.currentTarget as HTMLElement;
    const rect = el.getBoundingClientRect();
    const rel = (e.clientX - rect.left) / rect.width;
    if (last && now - last.t < 320 && Math.abs(last.x - rel) < 0.3) {
      // double-tap
      if (rel < 0.33) skip(-10);
      else if (rel > 0.66) skip(10);
      else togglePlay();
      lastTapRef.current = null;
      return;
    }
    lastTapRef.current = { t: now, x: rel };
    // Single-tap: toggle visibility / play
    setTimeout(() => {
      if (lastTapRef.current && lastTapRef.current.t === now) {
        if (visible) togglePlay();
        else poke();
        lastTapRef.current = null;
      }
    }, 260);
  };

  const pct = duration > 0 ? (time / duration) * 100 : 0;
  const bufPct = duration > 0 ? Math.min(100, (buffered / duration) * 100) : 0;
  const VolIcon = muted || volume === 0 ? VolumeX : volume < 0.5 ? Volume1 : Volume2;

  return (
    <div
      className="absolute inset-0 z-20 select-none"
      onPointerMove={poke}
      onClick={handleSurfaceTap}
    >
      {/* Buffering spinner (independent of chrome visibility) */}
      {waiting && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="bg-black/50 backdrop-blur-sm rounded-full p-3">
            <Loader2 className="w-8 h-8 text-primary animate-spin" />
          </div>
        </div>
      )}

      {/* Skip flash indicators */}
      {flash === 'back' && (
        <div className="absolute inset-y-0 left-0 w-1/3 flex items-center justify-center pointer-events-none animate-in fade-in zoom-in duration-200">
          <div className="flex flex-col items-center bg-black/50 rounded-full px-4 py-3">
            <RotateCcw className="w-8 h-8 text-primary" />
            <span className="text-[10px] font-bold text-white mt-1">-10s</span>
          </div>
        </div>
      )}
      {flash === 'fwd' && (
        <div className="absolute inset-y-0 right-0 w-1/3 flex items-center justify-center pointer-events-none animate-in fade-in zoom-in duration-200">
          <div className="flex flex-col items-center bg-black/50 rounded-full px-4 py-3">
            <RotateCw className="w-8 h-8 text-primary" />
            <span className="text-[10px] font-bold text-white mt-1">+10s</span>
          </div>
        </div>
      )}

      {/* Gradient scrims */}
      <div className={`absolute inset-x-0 top-0 h-20 bg-gradient-to-b from-black/80 to-transparent transition-opacity duration-300 pointer-events-none ${visible ? 'opacity-100' : 'opacity-0'}`} />
      <div className={`absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-black/90 to-transparent transition-opacity duration-300 pointer-events-none ${visible ? 'opacity-100' : 'opacity-0'}`} />

      <div className={`absolute inset-0 flex flex-col justify-between transition-opacity duration-300 ${visible ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
        {/* Top bar */}
        <div className="flex items-start justify-between gap-2 p-2 sm:p-3">
          <div className="min-w-0">
            <div className="font-display text-gold-gradient text-sm sm:text-base md:text-lg leading-none tracking-widest">KEVSTREAM</div>
            <p className="text-[10px] sm:text-[11px] text-foreground/80 truncate max-w-[55vw] mt-0.5">{title}</p>
          </div>
          <div className="flex items-center gap-1 bg-black/60 backdrop-blur-sm px-2 py-1 rounded-md text-[9px] sm:text-[10px] font-bold text-primary border border-primary/30 shrink-0">
            <Shield size={10} /> AD-FREE{badge ? ` · ${badge}` : ''}
          </div>
        </div>

        {/* Center controls */}
        <div className="flex items-center justify-center gap-6 sm:gap-8">
          <button onClick={() => skip(-10)} aria-label="Back 10 seconds"
            className="flex flex-col items-center text-foreground/90 hover:text-primary transition-colors active:scale-90">
            <RotateCcw className="w-6 h-6 sm:w-7 sm:h-7" />
            <span className="text-[9px] font-bold mt-0.5">10</span>
          </button>
          <button onClick={togglePlay} aria-label={playing ? 'Pause' : 'Play'}
            className="bg-gold-gradient text-primary-foreground rounded-full p-3 sm:p-4 shadow-gold hover:brightness-110 active:scale-95 transition-all">
            {playing ? <Pause className="w-6 h-6 sm:w-7 sm:h-7" fill="currentColor" /> : <Play className="w-6 h-6 sm:w-7 sm:h-7 ml-0.5" fill="currentColor" />}
          </button>
          <button onClick={() => skip(10)} aria-label="Forward 10 seconds"
            className="flex flex-col items-center text-foreground/90 hover:text-primary transition-colors active:scale-90">
            <RotateCw className="w-6 h-6 sm:w-7 sm:h-7" />
            <span className="text-[9px] font-bold mt-0.5">10</span>
          </button>
        </div>

        {/* Bottom bar */}
        <div className="px-2 sm:px-3 pb-2 sm:pb-2.5">
          {/* Seek bar */}
          <div
            ref={barRef}
            className="group relative h-6 flex items-center cursor-pointer touch-none"
            onPointerDown={onBarPointerDown}
            onPointerMove={onBarPointerMove}
            onPointerUp={onBarPointerUp}
            onPointerLeave={onBarLeave}
          >
            <div className="relative w-full h-1 group-hover:h-1.5 transition-all rounded-full bg-white/20 overflow-visible">
              <div className="absolute inset-y-0 left-0 rounded-full bg-white/30" style={{ width: `${bufPct}%` }} />
              <div className="absolute inset-y-0 left-0 rounded-full bg-gold-gradient" style={{ width: `${pct}%` }} />
              <div
                className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3.5 h-3.5 rounded-full bg-primary shadow-gold"
                style={{ left: `${pct}%` }}
              />
              {seekPreview && (
                <div
                  className="hidden sm:block absolute -top-8 -translate-x-1/2 px-1.5 py-0.5 rounded bg-black/80 text-[10px] text-white font-bold tabular-nums pointer-events-none"
                  style={{ left: seekPreview.x }}
                >
                  {fmt(seekPreview.t)}
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center justify-between gap-2 mt-0.5">
            <div className="flex items-center gap-2 sm:gap-3">
              <button onClick={togglePlay} className="text-foreground hover:text-primary transition-colors" aria-label={playing ? 'Pause' : 'Play'}>
                {playing ? <Pause size={18} /> : <Play size={18} />}
              </button>
              <div className="group flex items-center gap-1.5">
                <button onClick={toggleMute} className="text-foreground hover:text-primary transition-colors" aria-label={muted ? 'Unmute' : 'Mute'}>
                  <VolIcon size={18} />
                </button>
                <input
                  type="range"
                  min={0} max={1} step={0.05}
                  value={muted ? 0 : volume}
                  onChange={(e) => setVol(parseFloat(e.target.value))}
                  onClick={(e) => e.stopPropagation()}
                  className="hidden sm:block w-0 group-hover:w-20 transition-all duration-200 accent-primary h-1"
                  aria-label="Volume"
                />
              </div>
              <span className="text-[10px] sm:text-[11px] text-foreground/80 tabular-nums">
                {fmt(time)} <span className="text-foreground/40">/</span> {fmt(duration)}
              </span>
            </div>
            <div className="flex items-center gap-2 sm:gap-3">
              <button onClick={cycleRate} className="text-[11px] font-bold text-foreground/90 hover:text-primary transition-colors min-w-[32px]" aria-label="Playback speed">
                {rate}x
              </button>
              {typeof document !== 'undefined' && (document as any).pictureInPictureEnabled && (
                <button onClick={togglePip} className={`hidden sm:inline text-foreground hover:text-primary transition-colors ${pip ? 'text-primary' : ''}`} aria-label="Picture in picture">
                  <PictureInPicture2 size={18} />
                </button>
              )}
              <button onClick={toggleFullscreen} className="text-foreground hover:text-primary transition-colors" aria-label="Fullscreen">
                {fullscreen ? <Minimize size={18} /> : <Maximize size={18} />}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default KevStreamControls;
