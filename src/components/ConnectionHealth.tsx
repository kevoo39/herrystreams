import React, { useEffect, useRef, useState } from 'react';
import { Activity, Wifi, WifiOff, Loader2, AlertTriangle, Zap } from 'lucide-react';

export interface HealthState {
  retries: number;
  lastEvent: string;
  stalled: boolean;
  stalledSince: number | null;
}

interface Props {
  videoRef: React.RefObject<HTMLVideoElement>;
  health: HealthState;
  loading: boolean;
}

const fmtBps = (bps: number) => {
  if (!bps || !Number.isFinite(bps)) return '—';
  if (bps > 1_000_000) return `${(bps / 1_000_000).toFixed(1)} MB/s`;
  if (bps > 1000) return `${(bps / 1000).toFixed(0)} KB/s`;
  return `${bps.toFixed(0)} B/s`;
};

const fmtEta = (s: number) => {
  if (!Number.isFinite(s) || s <= 0) return '—';
  if (s < 60) return `${Math.ceil(s)}s`;
  const m = Math.floor(s / 60), sec = Math.ceil(s % 60);
  return `${m}m ${sec}s`;
};

const ConnectionHealth: React.FC<Props> = ({ videoRef, health, loading }) => {
  const [buffered, setBuffered] = useState(0);
  const [bufferedAhead, setBufferedAhead] = useState(0);
  const [speed, setSpeed] = useState(0);
  const [online, setOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);
  const [conn, setConn] = useState<string | null>(null);
  const [nowStall, setNowStall] = useState(0);

  const lastBytesRef = useRef<{ t: number; b: number } | null>(null);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const tick = () => {
      try {
        if (v.buffered.length) {
          const end = v.buffered.end(v.buffered.length - 1);
          setBuffered(end);
          setBufferedAhead(Math.max(0, end - v.currentTime));
        }
        // Estimate speed via transferred bytes (webkit only) fallback: buffer growth
        // We approximate as bytes = buffered seconds * bitrate (unknown), so use
        // buffered-ahead delta * avg bitrate proxy: bufferedAhead growth per second.
        const now = performance.now();
        const b = v.buffered.length ? v.buffered.end(v.buffered.length - 1) : 0;
        if (lastBytesRef.current) {
          const dt = (now - lastBytesRef.current.t) / 1000;
          const db = b - lastBytesRef.current.b;
          if (dt > 0.5) {
            // seconds of video buffered per second, times a rough 500KB/s per 1s of HD video
            const secPerSec = db / dt;
            setSpeed(Math.max(0, secPerSec) * 700_000);
            lastBytesRef.current = { t: now, b };
          }
        } else {
          lastBytesRef.current = { t: now, b };
        }
      } catch { /* ignore */ }
    };
    const id = setInterval(tick, 750);
    return () => clearInterval(id);
  }, [videoRef]);

  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    // Network Information API (Chromium)
    const nav: any = navigator;
    const c = nav.connection || nav.mozConnection || nav.webkitConnection;
    const updateConn = () => c && setConn(c.effectiveType || null);
    updateConn();
    c?.addEventListener?.('change', updateConn);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
      c?.removeEventListener?.('change', updateConn);
    };
  }, []);

  useEffect(() => {
    if (!health.stalledSince) { setNowStall(0); return; }
    const id = setInterval(() => setNowStall(Math.floor((Date.now() - (health.stalledSince ?? Date.now())) / 1000)), 500);
    return () => clearInterval(id);
  }, [health.stalledSince]);

  const showBadge = loading || health.stalled || health.retries > 0 || !online;
  if (!showBadge && bufferedAhead > 8) return null;

  const status =
    !online ? { label: 'Offline', tone: 'bg-destructive text-destructive-foreground', Icon: WifiOff } :
    health.stalled ? { label: `Recovering ${nowStall}s`, tone: 'bg-amber-500 text-black', Icon: AlertTriangle } :
    loading ? { label: 'Connecting…', tone: 'bg-primary text-primary-foreground', Icon: Loader2 } :
    bufferedAhead < 3 ? { label: 'Buffering', tone: 'bg-amber-500 text-black', Icon: Loader2 } :
    { label: 'Stable', tone: 'bg-green-500 text-black', Icon: Zap };

  const Icon = status.Icon;
  const spin = Icon === Loader2;
  const eta = speed > 0 && buffered > 0
    ? fmtEta(Math.max(0, (videoRef.current?.duration ?? 0) - buffered) * (700_000 / Math.max(speed, 1)))
    : '—';

  return (
    <div className="pointer-events-none absolute top-2 right-2 z-30 flex flex-col items-end gap-1">
      <div className={`flex items-center gap-1.5 px-2 py-1 rounded-md text-[10px] font-bold ${status.tone} shadow-lg`}>
        <Icon size={10} className={spin ? 'animate-spin' : ''} />
        {status.label}
      </div>
      {(health.retries > 0 || health.stalled || bufferedAhead < 3 || conn) && (
        <div className="flex flex-col items-end gap-0.5 bg-black/70 backdrop-blur-sm px-2 py-1 rounded-md text-[9px] text-white/90 font-mono border border-white/10">
          <div className="flex items-center gap-1"><Activity size={9} className="text-primary" />
            buf {bufferedAhead.toFixed(1)}s · {fmtBps(speed)}
          </div>
          {health.retries > 0 && (
            <div className="text-amber-400">retries: {health.retries} · {health.lastEvent}</div>
          )}
          {conn && (
            <div className="flex items-center gap-1 text-white/70">
              <Wifi size={9} /> {conn}{eta !== '—' ? ` · ETA ${eta}` : ''}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ConnectionHealth;
