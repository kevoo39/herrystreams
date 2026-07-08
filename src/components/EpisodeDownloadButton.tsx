// Enqueues a download into the central queue and reflects live status.
// The actual work runs in downloadQueue.ts so navigation between pages
// keeps downloads alive.

import React, { useEffect, useState } from 'react';
import { Download, Loader2, X, Check, AlertCircle, Clock } from 'lucide-react';
import {
  enqueue, cancel, retry, subscribe, initDownloadQueue,
  type DownloadJob, type JobStatus,
} from '@/lib/downloadQueue';

export type DownloadTarget =
  | { kind: 'movie'; tmdbId: number; parentTitle: string; image?: string }
  | { kind: 'tv'; tmdbId: number; season: number; episode: number; parentTitle: string; image?: string }
  | { kind: 'anime'; anilistId: number; malId?: string; episode: number; audioType: 'sub' | 'dub'; parentTitle: string; image?: string };

interface Props {
  target: DownloadTarget;
  variant?: 'icon' | 'full';
  className?: string;
}

function jobIdFor(target: DownloadTarget): string {
  if (target.kind === 'movie') return `movie-${target.tmdbId}`;
  if (target.kind === 'tv') return `tv-${target.tmdbId}-s${target.season}e${target.episode}`;
  return `anime-${target.anilistId}-${target.episode}-${target.audioType}`;
}

const EpisodeDownloadButton: React.FC<Props> = ({ target, variant = 'icon', className }) => {
  const id = jobIdFor(target);
  const [job, setJob] = useState<DownloadJob | undefined>(undefined);

  useEffect(() => {
    initDownloadQueue();
    return subscribe((jobs) => setJob(jobs.find((j) => j.id === id)));
  }, [id]);

  const status: JobStatus | 'idle' = job?.status ?? 'idle';
  const progress = job?.progress ?? 0;

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (status === 'downloading' || status === 'queued') return;
    if (status === 'failed' || status === 'canceled') {
      retry(id);
      return;
    }
    enqueue(target);
  };

  const handleCancel = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
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

  if (variant === 'full') {
    return (
      <button
        onClick={handleClick}
        title={job?.error || label}
        className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all ${
          status === 'failed' || status === 'canceled' ? 'bg-destructive text-destructive-foreground' :
          status === 'completed' ? 'bg-green-600 text-white' :
          status === 'downloading' || status === 'queued' ? 'bg-secondary text-foreground' :
          'bg-primary text-primary-foreground hover:brightness-110'
        } ${className || ''}`}
      >
        <Icon size={14} className={status === 'downloading' ? 'animate-spin' : ''} />
        <span>{label}</span>
        {(status === 'downloading' || status === 'queued') && (
          <span onClick={handleCancel} className="ml-1 opacity-70 hover:opacity-100"><X size={12} /></span>
        )}
      </button>
    );
  }

  return (
    <button
      onClick={handleClick}
      title={job?.error || `${label} — ${target.kind === 'anime' ? target.audioType.toUpperCase() : 'MP4'}`}
      className={`relative flex items-center justify-center w-8 h-8 rounded-lg border transition-all shrink-0 ${
        status === 'failed' || status === 'canceled' ? 'border-destructive/50 bg-destructive/10 text-destructive' :
        status === 'completed' ? 'border-green-500/50 bg-green-500/10 text-green-500' :
        status === 'downloading' ? 'border-primary/50 bg-primary/10 text-primary' :
        status === 'queued' ? 'border-amber-500/50 bg-amber-500/10 text-amber-500' :
        'border-border/40 bg-secondary/40 text-muted-foreground hover:border-primary/40 hover:text-primary'
      } ${className || ''}`}
    >
      <Icon size={14} className={status === 'downloading' ? 'animate-spin' : ''} />
      {status === 'downloading' && progress > 0 && (
        <span className="absolute -bottom-1 left-0 right-0 h-0.5 bg-background rounded-full overflow-hidden">
          <span className="block h-full bg-primary transition-all" style={{ width: `${progress}%` }} />
        </span>
      )}
    </button>
  );
};

export default EpisodeDownloadButton;
