import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Film, Tv, Sparkles, Trash2, Download as DownloadIcon, ChevronRight } from 'lucide-react';
import Navbar from '@/components/Navbar';
import EpisodeDownloadButton, { type DownloadTarget } from '@/components/EpisodeDownloadButton';
import {
  listDownloads, removeDownload, clearDownloads,
  type DownloadEntry, type DownloadKind,
} from '@/lib/downloads';

const tabs: { key: DownloadKind; label: string; icon: any }[] = [
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

const Downloads = () => {
  const [tab, setTab] = useState<DownloadKind>('movie');
  const [items, setItems] = useState<DownloadEntry[]>([]);

  useEffect(() => {
    const refresh = () => setItems(listDownloads());
    refresh();
    window.addEventListener('kevnest-downloads-changed', refresh);
    window.addEventListener('storage', refresh);
    return () => {
      window.removeEventListener('kevnest-downloads-changed', refresh);
      window.removeEventListener('storage', refresh);
    };
  }, []);

  const filtered = useMemo(() => items.filter(i => i.kind === tab), [items, tab]);

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="pt-20 pb-32 max-w-5xl mx-auto px-4 md:px-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <DownloadIcon className="text-primary" size={22} />
            <h1 className="text-2xl md:text-3xl font-bold font-display">Downloads</h1>
          </div>
          {filtered.length > 0 && (
            <button
              onClick={() => { if (confirm(`Clear ${tab} download history?`)) clearDownloads(tab); }}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-muted-foreground hover:text-destructive transition-colors"
            >
              <Trash2 size={12} /> Clear
            </button>
          )}
        </div>

        <div className="flex gap-2 mb-6 overflow-x-auto scrollbar-none">
          {tabs.map(t => {
            const active = tab === t.key;
            const count = items.filter(i => i.kind === t.key).length;
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

        {filtered.length === 0 ? (
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
                    <p className="text-sm font-semibold truncate group-hover:text-primary transition-colors">{e.title}</p>
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
