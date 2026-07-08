import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Film, Tv, Sparkles, Trash2, Download as DownloadIcon, ChevronRight,
  Loader2, Clock, Check, AlertCircle, X, RotateCw, Activity,
} from 'lucide-react';
import Navbar from '@/components/Navbar';
import EpisodeDownloadButton, { type DownloadTarget } from '@/components/EpisodeDownloadButton';
import {
  listDownloads, removeDownload, clearDownloads,
  type DownloadEntry, type DownloadKind,
} from '@/lib/downloads';
import {
  initDownloadQueue, subscribe, cancel, retry, remove, clearFinished,
  type DownloadJob, type JobStatus,
} from '@/lib/downloadQueue';

type TabKey = DownloadKind | 'active';

const tabs: { key: TabKey; label: string; icon: any }[] = [
  { key: 'active', label: 'Active', icon: Activity },
  { key: 'movie', label: 'Movies', icon: Film },
  { key: 'tv', label: 'TV Shows', icon: Tv },
  { key: 'anime', label: 'Anime', icon: Sparkles },
];

const fmtBytes = (b?: number) => {
  if (!b) return '';
  const mb = b / 1024 / 1024;
  return mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${mb.toFixed(1)} MB`;
};

const entryLink = (e: DownloadEntry): string => {
  if (e.kind === 'movie') return `/movie/${e.tmdbId}`;
  if (e.kind === 'tv') return `/tv/${e.tmdbId}?s=${e.season}&e=${e.episode}`;
  return `/anime/${e.malId ?? e.anilistId}?ep=${e.animeEpisode}`;
};

const entryToTarget = (e: DownloadEntry): DownloadTarget | null => {
  if (e.kind === 'movie' && e.tmdbId) return { kind: 'movie', tmdbId: e.tmdbId, parentTitle: e.parentTitle, image: e.image };
  if (e.kind === 'tv' && e.tmdbId && e.season && e.episode)
    return { kind: 'tv', tmdbId: e.tmdbId, season: e.season, episode: e.episode, parentTitle: e.parentTitle, image: e.image };
  if (e.kind === 'anime' && e.anilistId && e.animeEpisode && e.audioType)
    return { kind: 'anime', anilistId: e.anilistId, malId: e.malId, episode: e.animeEpisode, audioType: e.audioType, parentTitle: e.parentTitle, image: e.image };
  return null;
};

const statusBadge = (s: JobStatus) => {
  const map: Record<JobStatus, { label: string; cls: string; Icon: any; spin?: boolean }> = {
    queued:      { label: 'Queued',      cls: 'bg-amber-500/15 text-amber-500 border-amber-500/30', Icon: Clock },
    downloading: { label: 'Downloading', cls: 'bg-primary/15 text-primary border-primary/30',       Icon: Loader2, spin: true },
    completed:   { label: 'Completed',   cls: 'bg-green-500/15 text-green-500 border-green-500/30', Icon: Check },
    failed:      { label: 'Failed',      cls: 'bg-destructive/15 text-destructive border-destructive/30', Icon: AlertCircle },
    canceled:    { label: 'Canceled',    cls: 'bg-muted/60 text-muted-foreground border-border/40', Icon: X },
  };
  const m = map[s];
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${m.cls}`}>
      <m.Icon size={10} className={m.spin ? 'animate-spin' : ''} />
      {m.label}
    </span>
  );
};

const Downloads = () => {
  const [tab, setTab] = useState<TabKey>('active');
  const [items, setItems] = useState<DownloadEntry[]>([]);
  const [jobs, setJobs] = useState<DownloadJob[]>([]);

  useEffect(() => {
    initDownloadQueue();
    const refresh = () => setItems(listDownloads());
    refresh();
    window.addEventListener('kevnest-downloads-changed', refresh);
    window.addEventListener('storage', refresh);
    const unsub = subscribe(setJobs);
    return () => {
      window.removeEventListener('kevnest-downloads-changed', refresh);
      window.removeEventListener('storage', refresh);
      unsub();
    };
  }, []);

  const activeJobs = useMemo(
    () => jobs.filter((j) => j.status !== 'completed'),
    [jobs],
  );
  const filtered = useMemo(() => items.filter(i => i.kind === tab), [items, tab]);
  const inFlight = jobs.filter((j) => j.status === 'downloading' || j.status === 'queued').length;

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="pt-20 pb-32 max-w-5xl mx-auto px-4 md:px-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <DownloadIcon className="text-primary" size={22} />
            <h1 className="text-2xl md:text-3xl font-bold font-display">Downloads</h1>
          </div>
          {tab === 'active' && jobs.length > 0 && (
            <button
              onClick={() => { if (confirm('Clear finished jobs from the queue?')) clearFinished(); }}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-muted-foreground hover:text-destructive transition-colors"
            >
              <Trash2 size={12} /> Clear finished
            </button>
          )}
          {tab !== 'active' && filtered.length > 0 && (
            <button
              onClick={() => { if (confirm(`Clear ${tab} download history?`)) clearDownloads(tab as DownloadKind); }}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-muted-foreground hover:text-destructive transition-colors"
            >
              <Trash2 size={12} /> Clear
            </button>
          )}
        </div>

        {inFlight > 0 && (
          <div className="mb-4 flex items-center gap-2 p-3 rounded-lg border border-primary/30 bg-primary/5 text-xs">
            <Loader2 size={14} className="text-primary animate-spin" />
            <span className="font-semibold text-foreground">
              {inFlight} download{inFlight > 1 ? 's' : ''} running.
            </span>
            <span className="text-muted-foreground">
              Keep this tab open — closing the app pauses in-progress downloads.
            </span>
          </div>
        )}

        <div className="flex gap-2 mb-6 overflow-x-auto scrollbar-none">
          {tabs.map(t => {
            const active = tab === t.key;
            const count = t.key === 'active'
              ? activeJobs.length
              : items.filter(i => i.kind === t.key).length;
            const Icon = t.icon;
            return (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all shrink-0 ${
                  active ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/20'
                        : 'bg-secondary/50 border border-border/30 text-muted-foreground hover:text-foreground'
                }`}
              >
                <Icon size={14} />
                {t.label}
                <span className={`px-1.5 py-0.5 rounded text-[10px] ${
                  active ? 'bg-primary-foreground/20' : 'bg-background'
                }`}>{count}</span>
              </button>
            );
          })}
        </div>

        {tab === 'active' ? (
          activeJobs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <Activity size={40} className="text-muted-foreground/40 mb-3" />
              <p className="text-sm text-muted-foreground">Nothing in the download queue.</p>
              <p className="text-xs text-muted-foreground/70 mt-1">
                Tap the download icon on any movie or episode to queue it up.
              </p>
            </div>
          ) : (
            <ul className="flex flex-col gap-2">
              {activeJobs.map((j) => (
                <li
                  key={j.id}
                  className="flex items-center gap-3 p-3 rounded-lg border border-border/30 bg-secondary/30"
                >
                  {j.target.image ? (
                    <img src={j.target.image} alt="" className="w-12 h-16 rounded-md object-cover shrink-0 bg-background" />
                  ) : (
                    <div className="w-12 h-16 rounded-md bg-background flex items-center justify-center shrink-0">
                      <DownloadIcon size={16} className="text-muted-foreground" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="text-sm font-semibold truncate">{j.display}</p>
                      {statusBadge(j.status)}
                    </div>
                    {j.status === 'downloading' && (
                      <div className="w-full h-1.5 rounded-full bg-background overflow-hidden mb-1">
                        <div className="h-full bg-primary transition-all" style={{ width: `${j.progress}%` }} />
                      </div>
                    )}
                    <p className="text-[11px] text-muted-foreground truncate">
                      {j.status === 'downloading' && (
                        <>
                          {j.progress}% · {fmtBytes(j.bytes)}
                          {j.total ? ` / ${fmtBytes(j.total)}` : ''}
                        </>
                      )}
                      {j.status === 'queued' && (j.error || 'Waiting for a free slot…')}
                      {j.status === 'failed' && (j.error || 'Download failed')}
                      {j.status === 'canceled' && 'Canceled'}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {(j.status === 'failed' || j.status === 'canceled') && (
                      <button
                        onClick={() => retry(j.id)}
                        className="w-8 h-8 flex items-center justify-center rounded-lg border border-primary/40 bg-primary/10 text-primary hover:bg-primary/20"
                        title="Retry"
                      >
                        <RotateCw size={14} />
                      </button>
                    )}
                    {(j.status === 'downloading' || j.status === 'queued') && (
                      <button
                        onClick={() => cancel(j.id)}
                        className="w-8 h-8 flex items-center justify-center rounded-lg border border-border/40 bg-secondary/40 text-muted-foreground hover:text-destructive hover:border-destructive/40"
                        title="Cancel"
                      >
                        <X size={14} />
                      </button>
                    )}
                    <button
                      onClick={() => remove(j.id)}
                      className="w-8 h-8 flex items-center justify-center rounded-lg border border-border/40 bg-secondary/40 text-muted-foreground hover:text-destructive hover:border-destructive/40"
                      title="Remove"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <DownloadIcon size={40} className="text-muted-foreground/40 mb-3" />
            <p className="text-sm text-muted-foreground">
              No {tabs.find(t => t.key === tab)?.label.toLowerCase()} downloaded yet.
            </p>
            <p className="text-xs text-muted-foreground/70 mt-1">
              Tap the download icon on any {tab === 'movie' ? 'movie' : 'episode'} to save it.
            </p>
          </div>
        ) : (
          <ul className="flex flex-col gap-2">
            {filtered.map(e => {
              const target = entryToTarget(e);
              return (
                <li
                  key={e.id}
                  className="flex items-center gap-3 p-3 rounded-lg border border-border/30 bg-secondary/30 hover:border-primary/30 transition-colors"
                >
                  {e.image ? (
                    <img src={e.image} alt="" className="w-12 h-16 rounded-md object-cover shrink-0 bg-background" />
                  ) : (
                    <div className="w-12 h-16 rounded-md bg-background flex items-center justify-center shrink-0">
                      <DownloadIcon size={16} className="text-muted-foreground" />
                    </div>
                  )}
                  <Link to={entryLink(e)} className="flex-1 min-w-0 group">
                    <div className="flex items-center gap-2 mb-0.5">
                      <p className="text-sm font-semibold truncate group-hover:text-primary transition-colors">{e.title}</p>
                      {statusBadge('completed')}
                    </div>
                    <p className="text-[11px] text-muted-foreground truncate">
                      {new Date(e.savedAt).toLocaleString()}
                      {e.bytes ? ` · ${fmtBytes(e.bytes)}` : ''}
                      {e.filename ? ` · ${e.filename}` : ''}
                    </p>
                  </Link>
                  {target && <EpisodeDownloadButton target={target} />}
                  <button
                    onClick={() => removeDownload(e.id)}
                    className="w-8 h-8 flex items-center justify-center rounded-lg border border-border/40 bg-secondary/40 text-muted-foreground hover:text-destructive hover:border-destructive/40 transition-colors shrink-0"
                    title="Remove from history"
                  >
                    <Trash2 size={14} />
                  </button>
                  <Link
                    to={entryLink(e)}
                    className="w-8 h-8 flex items-center justify-center rounded-lg border border-border/40 bg-secondary/40 text-muted-foreground hover:text-primary hover:border-primary/40 transition-colors shrink-0"
                    title="Open"
                  >
                    <ChevronRight size={14} />
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </main>
    </div>
  );
};

export default Downloads;
