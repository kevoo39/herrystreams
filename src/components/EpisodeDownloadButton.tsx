// Enqueues a download into the central queue and reflects live status.
// The actual work runs in downloadQueue.ts so navigation between pages
// keeps downloads alive. When idle, tapping opens a quality picker.

import React, { useEffect, useRef, useState } from 'react';
import { Download, Loader2, X, Check, AlertCircle, Clock, ChevronDown } from 'lucide-react';
import {
  enqueue, cancel, retry, subscribe, initDownloadQueue,
  type DownloadJob, type JobStatus,
} from '@/lib/downloadQueue';

export type Quality = 'auto' | '1080' | '720' | '480' | '360';

export type DownloadTarget =
  | { kind: 'movie'; tmdbId: number; parentTitle: string; image?: string; quality?: Quality }
  | { kind: 'tv'; tmdbId: number; season: number; episode: number; parentTitle: string; image?: string; quality?: Quality }
  | { kind: 'anime'; anilistId: number; malId?: string; episode: number; audioType: 'sub' | 'dub'; parentTitle: string; image?: string; quality?: Quality };

interface Props {
  target: DownloadTarget;
  variant?: 'icon' | 'full';
  className?: string;
}

const QUALITIES: { value: Quality; label: string }[] = [
  { value: 'auto', label: 'Auto (Best)' },
  { value: '1080', label: '1080p Full HD' },
  { value: '720', label: '720p HD' },
  { value: '480', label: '480p SD' },
  { value: '360', label: '360p Low' },
];

function jobIdFor(target: DownloadTarget): string {
  const q = target.quality && target.quality !== 'auto' ? `-${target.quality}` : '';
  if (target.kind === 'movie') return `movie-${target.tmdbId}${q}`;
  if (target.kind === 'tv') return `tv-${target.tmdbId}-s${target.season}e${target.episode}${q}`;
  return `anime-${target.anilistId}-${target.episode}-${target.audioType}${q}`;
}

const EpisodeDownloadButton: React.FC<Props> = ({ target, variant = 'icon', className }) => {
  const [chosenQuality, setChosenQuality] = useState<Quality>(target.quality ?? 'auto');
  const activeTarget: DownloadTarget = { ...target, quality: chosenQuality } as DownloadTarget;
  const id = jobIdFor(activeTarget);
  const [job, setJob] = useState<DownloadJob | undefined>(undefined);
  const [menuOpen, setMenuOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    initDownloadQueue();
    return subscribe((jobs) => setJob(jobs.find((j) => j.id === id)));
  }, [id]);

  useEffect(() => {
    if (!menuOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [menuOpen]);

  const status: JobStatus | 'idle' = job?.status ?? 'idle';
  const progress = job?.progress ?? 0;

  const start = (q: Quality) => {
    setChosenQuality(q);
    enqueue({ ...target, quality: q } as DownloadTarget);
    setMenuOpen(false);
  };

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (status === 'downloading' || status === 'queued') return;
    if (status === 'failed' || status === 'canceled') { retry(id); return; }
    setMenuOpen((v) => !v);
  };

  const handleCancel = (e: React.MouseEvent) => {
    e.stopPropagation(); e.preventDefault();
    cancel(id);
  };

  const label =
    status === 'queued' ? 'Queued' :
    status === 'downloading' ? (progress > 0 ? `${progress}%` : '…') :
    status === 'completed' ? 'Saved' :
    status === 'failed' ? 'Retry' :
    status === 'canceled' ? 'Retry' : 'Download';

  const Icon =
    status === 'queued' ? Clock :
    status === 'downloading' ? Loader2 :
    status === 'completed' ? Check :
    status === 'failed' || status === 'canceled' ? AlertCircle : Download;

  const menu = menuOpen && status !== 'downloading' && status !== 'queued' && (
    <div className="absolute right-0 top-full mt-1 z-50 min-w-[160px] rounded-lg border border-border/50 bg-popover shadow-xl overflow-hidden">
      <div className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wide text-muted-foreground border-b border-border/40">Quality</div>
      {QUALITIES.map((q) => (
        <button
          key={q.value}
          onClick={(e) => { e.stopPropagation(); e.preventDefault(); start(q.value); }}
          className={`w-full text-left px-3 py-2 text-xs font-medium hover:bg-secondary transition-colors flex items-center justify-between ${
            chosenQuality === q.value ? 'text-primary' : 'text-foreground'
          }`}
        >
          <span>{q.label}</span>
          {chosenQuality === q.value && <Check size={12} />}
        </button>
      ))}
    </div>
  );

  if (variant === 'full') {
    return (
      <div ref={rootRef} className={`relative inline-flex ${className || ''}`}>
        <button
          onClick={handleClick}
          title={job?.error || label}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all ${
            status === 'failed' || status === 'canceled' ? 'bg-destructive text-destructive-foreground' :
            status === 'completed' ? 'bg-green-600 text-white' :
            status === 'downloading' || status === 'queued' ? 'bg-secondary text-foreground' :
            'bg-primary text-primary-foreground hover:brightness-110'
          }`}
        >
          <Icon size={14} className={status === 'downloading' ? 'animate-spin' : ''} />
          <span>{label}</span>
          {status === 'idle' && <ChevronDown size={12} className="opacity-70" />}
          {(status === 'downloading' || status === 'queued') && (
            <span onClick={handleCancel} className="ml-1 opacity-70 hover:opacity-100"><X size={12} /></span>
          )}
        </button>
        {menu}
      </div>
    );
  }

  return (
    <div ref={rootRef} className={`relative shrink-0 ${className || ''}`}>
      <button
        onClick={handleClick}
        title={job?.error || `${label} — ${chosenQuality === 'auto' ? 'Auto' : chosenQuality + 'p'}`}
        className={`relative flex items-center justify-center w-8 h-8 rounded-lg border transition-all ${
          status === 'failed' || status === 'canceled' ? 'border-destructive/50 bg-destructive/10 text-destructive' :
          status === 'completed' ? 'border-green-500/50 bg-green-500/10 text-green-500' :
          status === 'downloading' ? 'border-primary/50 bg-primary/10 text-primary' :
          status === 'queued' ? 'border-amber-500/50 bg-amber-500/10 text-amber-500' :
          'border-border/40 bg-secondary/40 text-muted-foreground hover:border-primary/40 hover:text-primary'
        }`}
      >
        <Icon size={14} className={status === 'downloading' ? 'animate-spin' : ''} />
        {status === 'downloading' && progress > 0 && (
          <span className="absolute -bottom-1 left-0 right-0 h-0.5 bg-background rounded-full overflow-hidden">
            <span className="block h-full bg-primary transition-all" style={{ width: `${progress}%` }} />
          </span>
        )}
      </button>
      {menu}
    </div>
  );
};

export default EpisodeDownloadButton;
