import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Play, Pause, RotateCcw, RotateCw, Volume2, VolumeX,
  Maximize, Minimize, Shield,
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
  const [rate, setRate] = useState(1);
  const [fullscreen, setFullscreen] = useState(false);
  const [visible, setVisible] = useState(true);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);

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
    const onVol = () => setMuted(v.muted);
    const onRate = () => setRate(v.playbackRate);
    v.addEventListener('play', onPlay);
    v.addEventListener('pause', onPause);
    v.addEventListener('timeupdate', onTime);
    v.addEventListener('durationchange', onDur);
    v.addEventListener('loadedmetadata', onDur);
    v.addEventListener('progress', onProg);
    v.addEventListener('volumechange', onVol);
    v.addEventListener('ratechange', onRate);
    setPlaying(!v.paused);
    setDuration(v.duration || 0);
    setMuted(v.muted);
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
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, [videoRef, scheduleHide]);

  useEffect(() => {
    const onFs = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onFs);
    return () => document.removeEventListener('fullscreenchange', onFs);
  }, []);

  const togglePlay = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) v.play().catch(() => {});
    else v.pause();
    poke();
  };

  const skip = (delta: number) => {
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = Math.max(0, Math.min((v.duration || Infinity), v.currentTime + delta));
    poke();
  };

  const toggleMute = () => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = !v.muted;
    poke();
  };

  const cycleRate = () => {
    const v = videoRef.current;
    if (!v) return;
    const i = RATES.indexOf(v.playbackRate);
    v.playbackRate = RATES[(i + 1) % RATES.length] ?? 1;
    poke();
  };

  const toggleFullscreen = () => {
    const el = containerRef.current;
    const v = videoRef.current as any;
    if (!el) return;
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    } else if (el.requestFullscreen) {
      el.requestFullscreen().catch(() => {});
    } else if (v?.webkitEnterFullscreen) {
      v.webkitEnterFullscreen(); // iOS Safari
    }
    poke();
  };

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
    if (draggingRef.current) seekFromPointer(e.clientX);
  };
  const onBarPointerUp = () => {
    draggingRef.current = false;
    poke();
  };

  const pct = duration > 0 ? (time / duration) * 100 : 0;
  const bufPct = duration > 0 ? Math.min(100, (buffered / duration) * 100) : 0;

  return (
    <div
      className="absolute inset-0 z-20 select-none"
      onPointerMove={poke}
      onClick={(e) => {
        // tap on empty area toggles visibility / play
        if (e.target === e.currentTarget) {
          if (visible) togglePlay();
          else poke();
        }
      }}
    >
      {/* Gradient scrims */}
      <div className={`absolute inset-x-0 top-0 h-20 bg-gradient-to-b from-black/80 to-transparent transition-opacity duration-300 pointer-events-none ${visible ? 'opacity-100' : 'opacity-0'}`} />
      <div className={`absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-black/90 to-transparent transition-opacity duration-300 pointer-events-none ${visible ? 'opacity-100' : 'opacity-0'}`} />

      <div className={`absolute inset-0 flex flex-col justify-between transition-opacity duration-300 ${visible ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
        {/* Top bar */}
        <div className="flex items-start justify-between gap-2 p-3">
          <div className="min-w-0">
            <div className="font-display text-gold-gradient text-base md:text-lg leading-none tracking-widest">KEVSTREAM</div>
            <p className="text-[11px] text-foreground/80 truncate max-w-[55vw] mt-0.5">{title}</p>
          </div>
          <div className="flex items-center gap-1 bg-black/60 backdrop-blur-sm px-2 py-1 rounded-md text-[10px] font-bold text-primary border border-primary/30 shrink-0">
            <Shield size={10} /> AD-FREE{badge ? ` · ${badge}` : ''}
          </div>
        </div>

        {/* Center controls */}
        <div className="flex items-center justify-center gap-8">
          <button onClick={() => skip(-10)} aria-label="Back 10 seconds"
            className="flex flex-col items-center text-foreground/90 hover:text-primary transition-colors active:scale-90">
            <RotateCcw size={26} />
            <span className="text-[9px] font-bold mt-0.5">10</span>
          </button>
          <button onClick={togglePlay} aria-label={playing ? 'Pause' : 'Play'}
            className="bg-gold-gradient text-primary-foreground rounded-full p-4 shadow-gold hover:brightness-110 active:scale-95 transition-all">
            {playing ? <Pause size={26} fill="currentColor" /> : <Play size={26} fill="currentColor" className="ml-0.5" />}
          </button>
          <button onClick={() => skip(10)} aria-label="Forward 10 seconds"
            className="flex flex-col items-center text-foreground/90 hover:text-primary transition-colors active:scale-90">
            <RotateCw size={26} />
            <span className="text-[9px] font-bold mt-0.5">10</span>
          </button>
        </div>

        {/* Bottom bar */}
        <div className="px-3 pb-2.5">
          {/* Seek bar */}
          <div
            ref={barRef}
            className="group relative h-6 flex items-center cursor-pointer touch-none"
            onPointerDown={onBarPointerDown}
            onPointerMove={onBarPointerMove}
            onPointerUp={onBarPointerUp}
          >
            <div className="relative w-full h-1 group-hover:h-1.5 transition-all rounded-full bg-white/20 overflow-visible">
              <div className="absolute inset-y-0 left-0 rounded-full bg-white/30" style={{ width: `${bufPct}%` }} />
              <div className="absolute inset-y-0 left-0 rounded-full bg-gold-gradient" style={{ width: `${pct}%` }} />
              <div
                className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3.5 h-3.5 rounded-full bg-primary shadow-gold"
                style={{ left: `${pct}%` }}
              />
            </div>
          </div>

          <div className="flex items-center justify-between gap-2 mt-0.5">
            <div className="flex items-center gap-3">
              <button onClick={togglePlay} className="text-foreground hover:text-primary transition-colors" aria-label={playing ? 'Pause' : 'Play'}>
                {playing ? <Pause size={18} /> : <Play size={18} />}
              </button>
              <button onClick={toggleMute} className="text-foreground hover:text-primary transition-colors" aria-label={muted ? 'Unmute' : 'Mute'}>
                {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
              </button>
              <span className="text-[11px] text-foreground/80 tabular-nums">
                {fmt(time)} <span className="text-foreground/40">/</span> {fmt(duration)}
              </span>
            </div>
            <div className="flex items-center gap-3">
              <button onClick={cycleRate} className="text-[11px] font-bold text-foreground/90 hover:text-primary transition-colors min-w-[34px]" aria-label="Playback speed">
                {rate}x
              </button>
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
