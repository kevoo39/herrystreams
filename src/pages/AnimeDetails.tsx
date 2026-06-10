import { useEffect, useState, useCallback, useMemo } from 'react';
import { useParams, Link, useSearchParams } from 'react-router-dom';
import Navbar from '@/components/Navbar';
import VideoPlayer from '@/components/VideoPlayer';
import { Play, Plus, Star, Calendar, Clock, ChevronLeft, List, Volume2, VolumeX, Bug } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

import {
  fetchAnilistMeta,
  parseAnilistEpTitle,
  detectPartNumber,
  buildDisplayEpisodes,
  type AniListMeta,
} from '@/lib/malToAnilist';

const EPISODES_PER_PAGE = 100;

const AnimeDetails = () => {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const [anime, setAnime] = useState<any>(null);
  const [episodes, setEpisodes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedEpisode, setSelectedEpisode] = useState<number | null>(null);
  const [relatedSeasons, setRelatedSeasons] = useState<any[]>([]);
  const [trailerMuted, setTrailerMuted] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalEpisodes, setTotalEpisodes] = useState(0);
  const [anilistTotal, setAnilistTotal] = useState(0);
  const [anilistTitles, setAnilistTitles] = useState<Record<number, string>>({});
  const [anilistMeta, setAnilistMeta] = useState<AniListMeta | null>(null);
  const [episodesLoading, setEpisodesLoading] = useState(false);
  const [showDebug, setShowDebug] = useState(false);

  // Fetch all episode pages from Jikan
  const fetchAllEpisodes = useCallback(async (animeId: string) => {
    setEpisodesLoading(true);
    let allEps: any[] = [];
    let page = 1;
    let hasMore = true;

    while (hasMore) {
      try {
        // Jikan rate limit: wait between requests
        if (page > 1) await new Promise(r => setTimeout(r, 400));
        const res = await fetch(`https://api.jikan.moe/v4/anime/${animeId}/episodes?page=${page}`);
        const data = await res.json();
        const eps = data.data || [];
        allEps = [...allEps, ...eps];
        hasMore = data.pagination?.has_next_page || false;
        page++;
      } catch {
        hasMore = false;
      }
    }

    allEps.sort((a: any, b: any) => (a.mal_id ?? 0) - (b.mal_id ?? 0));
    setEpisodes(allEps);
    setTotalEpisodes(allEps.length);
    setEpisodesLoading(false);
  }, []);

  useEffect(() => {
    // Reset per-anime state so sequels/prequels never inherit the previous title's data
    setAnime(null);
    setEpisodes([]);
    setTotalEpisodes(0);
    setAnilistTotal(0);
    setAnilistTitles({});
    setAnilistMeta(null);
    setRelatedSeasons([]);
    setSelectedEpisode(null);
    setCurrentPage(1);
    setLoading(true);

    let cancelled = false;

    const fetchDetails = async () => {
      try {
        const animeRes = await fetch(`https://api.jikan.moe/v4/anime/${id}`);
        const animeData = await animeRes.json();
        if (cancelled) return;
        setAnime(animeData.data);

        // Set total from API data first for quick display
        const apiTotal = animeData.data?.episodes || 0;
        setTotalEpisodes(apiTotal);

        // Run Jikan episode pagination and AniList lookup in parallel so AniList
        // titles arrive even when Jikan stalls or returns only 1 episode.
        await Promise.all([
          fetchAllEpisodes(id!).catch(() => {}),
          (async () => {
            try {
              const meta = await fetchAnilistMeta(id!);
              if (cancelled || !meta) return;
              setAnilistMeta(meta);
              const total = meta.episodes
                ?? (meta.nextAiringEpisode ? meta.nextAiringEpisode.episode - 1 : 0);
              if (total && total > 0) setAnilistTotal(total);

              const titleMap: Record<number, string> = {};
              meta.streamingEpisodes.forEach((se, i) => {
                const { num, title } = parseAnilistEpTitle(se.title);
                const n = num ?? (i + 1);
                if (title) titleMap[n] = title;
              });
              if (Object.keys(titleMap).length) setAnilistTitles(titleMap);
            } catch {}
          })(),
        ]);

        try {
          await new Promise(r => setTimeout(r, 400));
          const relRes = await fetch(`https://api.jikan.moe/v4/anime/${id}/relations`);
          const relData = await relRes.json();
          if (cancelled) return;
          const seasons = (relData.data || [])
            .filter((r: any) => ['Sequel', 'Prequel'].includes(r.relation))
            .flatMap((r: any) => r.entry.filter((e: any) => e.type === 'anime').map((e: any) => ({ ...e, relation: r.relation })));
          setRelatedSeasons(seasons);
        } catch {}
      } catch (e) { console.error(e); }
      finally { if (!cancelled) setLoading(false); }
    };
    fetchDetails();
    window.scrollTo(0, 0);
    const epParam = parseInt(searchParams.get('ep') || '');
    if (Number.isFinite(epParam) && epParam > 0) setSelectedEpisode(epParam);

    return () => { cancelled = true; };
  }, [id, fetchAllEpisodes]);

  const handleNextEpisode = useCallback(() => {
    if (selectedEpisode && episodes.length > 0) {
      const idx = episodes.findIndex(e => e.mal_id === selectedEpisode);
      if (idx < episodes.length - 1) {
        setSelectedEpisode(episodes[idx + 1].mal_id);
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    }
  }, [selectedEpisode, episodes]);

  // Estimate episode count for currently-airing series with no Jikan data
  const estimateAiredCount = () => {
    const from = anime?.aired?.from ? new Date(anime.aired.from).getTime() : 0;
    if (!from) return 0;
    const to = anime?.aired?.to ? new Date(anime.aired.to).getTime() : Date.now();
    const weeks = Math.max(1, Math.floor((to - from) / (7 * 24 * 60 * 60 * 1000)) + 1);
    return Math.min(weeks, 60);
  };

  // Part/Cour detection drives overall episode numbering for Season X Part Y splits.
  const partNumber = useMemo(() => detectPartNumber(anime?.title), [anime?.title]);
  // Heuristic: Part N starts at (N-1) * episodes-in-Part-1. We don't always know
  // Part 1's length, so default to the current Part's episode count as the offset
  // when we have no better signal. Users only see the per-Part list anyway.
  const partStart = partNumber > 1 ? ((partNumber - 1) * Math.max(episodes.length, anilistTotal, 12)) + 1 : 1;

  const built = useMemo(() => buildDisplayEpisodes({
    jikanEpisodes: episodes,
    anilistTotal,
    anilistTitles,
    estimatedAiring: (anime?.status === 'Currently Airing' || anime?.airing) ? estimateAiredCount() : 0,
    jikanReportedTotal: totalEpisodes,
    partStart,
  }), [episodes, anilistTotal, anilistTitles, anime, totalEpisodes, partStart]);

  const displayEpisodes = built.episodes;
  const effectiveTotal = built.effectiveTotal;

  const totalPages = Math.ceil(displayEpisodes.length / EPISODES_PER_PAGE);
  const paginatedEpisodes = displayEpisodes.slice(
    (currentPage - 1) * EPISODES_PER_PAGE,
    currentPage * EPISODES_PER_PAGE
  );

  // Get trailer embed URL from Jikan data
  const trailerUrl = anime?.trailer?.embed_url;

  if (loading) return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="w-10 h-10 border-2 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  );

  if (!anime) return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <span className="text-muted-foreground">Anime not found</span>
    </div>
  );

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="relative pt-16">
        <div className="absolute inset-0 h-[400px] overflow-hidden pointer-events-none">
          <img src={anime.images.webp.large_image_url} alt="" className="w-full h-full object-cover blur-[80px] opacity-15 scale-150" />
          <div className="absolute inset-0 bg-gradient-to-b from-transparent to-background" />
        </div>

        <main className="relative max-w-7xl mx-auto px-4 md:px-6 py-8">
          <AnimatePresence mode="wait">
            {selectedEpisode ? (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mb-8 space-y-4">
                <div className="flex items-center gap-3">
                  <button onClick={() => setSelectedEpisode(null)} className="p-1.5 hover:bg-secondary rounded-lg transition-colors">
                    <ChevronLeft size={18} />
                  </button>
                  <div className="min-w-0">
                    <h2 className="text-lg font-bold font-display truncate">Now Playing</h2>
                    <p className="text-xs text-muted-foreground truncate">
                      Episode {selectedEpisode}: {displayEpisodes.find(e => e.mal_id === selectedEpisode)?.title || 'Untitled'}
                    </p>
                  </div>
                </div>
                <VideoPlayer
                  malId={id!}
                  animeEpisode={selectedEpisode}
                  title={anime.title}
                  type="anime"
                  totalEpisodes={displayEpisodes.length}
                  onNextEpisode={handleNextEpisode}
                />
              </motion.div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-[240px_1fr] gap-8 mb-8">
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="hidden lg:block">
                  <div className="aspect-[2/3] rounded-xl overflow-hidden border border-border/30 shadow-xl">
                    <img src={anime.images.webp.large_image_url} alt={anime.title} className="w-full h-full object-cover" />
                  </div>
                </motion.div>
                <div className="space-y-5 min-w-0">
                  <div className="flex flex-wrap gap-2">
                    {anime.genres?.map((g: any) => (
                      <span key={g.mal_id} className="px-2 py-0.5 bg-primary/10 text-primary rounded text-[10px] font-bold border border-primary/20">{g.name}</span>
                    ))}
                  </div>
                  <h1 className="text-2xl md:text-4xl font-bold font-display tracking-tight leading-tight break-words">{anime.title}</h1>
                  <div className="flex flex-wrap items-center gap-4 text-xs font-medium text-muted-foreground">
                    {anime.score && <div className="flex items-center gap-1 text-primary"><Star size={14} fill="currentColor" /><span className="font-bold">{anime.score}</span></div>}
                    {anime.aired?.prop?.from?.year && <div className="flex items-center gap-1"><Calendar size={12} /><span>{anime.aired.prop.from.year}</span></div>}
                    {anime.duration && <div className="flex items-center gap-1"><Clock size={12} /><span>{anime.duration}</span></div>}
                    {totalEpisodes > 0 && <span>{totalEpisodes} Episodes</span>}
                  </div>
                  <p className="text-sm text-muted-foreground leading-relaxed line-clamp-4 break-words">{anime.synopsis}</p>
                  <div className="flex flex-wrap gap-3">
                    <button onClick={() => setSelectedEpisode(1)} className="flex items-center gap-2 bg-primary text-primary-foreground px-6 py-3 rounded-lg font-semibold text-sm hover:brightness-110 transition-all shadow-lg shadow-primary/20">
                      <Play size={16} fill="currentColor" />Watch Now
                    </button>
                    <button className="flex items-center gap-2 bg-secondary border border-border/30 px-6 py-3 rounded-lg font-semibold text-sm hover:bg-muted transition-colors">
                      <Plus size={16} />Watchlist
                    </button>
                  </div>

                  {/* Trailer with volume toggle */}
                  {trailerUrl && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <h3 className="text-sm font-bold font-display">Trailer</h3>
                        <button
                          onClick={() => setTrailerMuted(!trailerMuted)}
                          className="flex items-center gap-1.5 px-2.5 py-1 bg-secondary border border-border/30 rounded-lg text-xs font-semibold hover:bg-muted transition-colors"
                        >
                          {trailerMuted ? <VolumeX size={14} /> : <Volume2 size={14} />}
                          {trailerMuted ? 'Unmute' : 'Mute'}
                        </button>
                      </div>
                      <div className="aspect-video rounded-lg overflow-hidden border border-border/30">
                        <iframe
                          src={`${trailerUrl}${trailerUrl.includes('?') ? '&' : '?'}autoplay=0&mute=${trailerMuted ? 1 : 0}&enablejsapi=1`}
                          className="w-full h-full"
                          allowFullScreen
                          allow="autoplay; encrypted-media"
                          frameBorder="0"
                          title={`${anime.title} Trailer`}
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </AnimatePresence>

          {relatedSeasons.length > 0 && (
            <section className="mb-8">
              <h2 className="text-lg font-bold font-display mb-3">Seasons</h2>
              <div className="flex flex-wrap gap-2">
                {relatedSeasons.map((entry: any, idx: number) => (
                  <Link key={entry.mal_id} to={`/anime/${entry.mal_id}`} className="flex items-center gap-2 px-3 py-2 bg-secondary/30 border border-border/30 rounded-lg hover:bg-secondary/60 hover:border-primary/20 transition-colors min-w-0">
                    <div className="w-6 h-6 rounded bg-primary/10 flex items-center justify-center text-primary text-[10px] font-bold shrink-0">{idx + 1}</div>
                    <div className="min-w-0">
                      <p className="text-xs font-semibold truncate max-w-[200px]">{entry.name}</p>
                      <p className="text-[10px] text-muted-foreground">{entry.relation}</p>
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          )}

          <section>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <List size={16} className="text-primary" />
                <h2 className="text-lg font-bold font-display">Episodes</h2>
                {partNumber > 1 && (
                  <span className="text-[10px] font-bold px-2 py-0.5 bg-primary/10 text-primary rounded border border-primary/20">
                    Part {partNumber} · Overall Ep {partStart}-{partStart + displayEpisodes.length - 1}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowDebug(v => !v)}
                  title="Show episode data source"
                  className={`p-1.5 rounded border text-[10px] font-bold transition-colors ${showDebug ? 'bg-primary/10 border-primary/30 text-primary' : 'bg-secondary border-border/30 text-muted-foreground hover:text-foreground'}`}
                >
                  <Bug size={12} />
                </button>
                <span className="text-[10px] font-bold px-2 py-1 bg-secondary rounded border border-border/30">
                  {displayEpisodes.length} Total
                </span>
              </div>
            </div>

            {showDebug && (
              <div className="mb-4 p-3 rounded-lg border border-border/40 bg-secondary/30 text-[11px] font-mono space-y-1">
                <div><span className="text-muted-foreground">source:</span> <span className="text-primary font-bold">{built.source}</span></div>
                <div><span className="text-muted-foreground">reason:</span> {built.reason}</div>
                <div className="grid grid-cols-2 gap-x-4">
                  <div><span className="text-muted-foreground">jikan eps:</span> {episodes.length}</div>
                  <div><span className="text-muted-foreground">jikan total:</span> {totalEpisodes}</div>
                  <div><span className="text-muted-foreground">anilist total:</span> {anilistTotal}</div>
                  <div><span className="text-muted-foreground">anilist titles:</span> {Object.keys(anilistTitles).length}</div>
                  <div><span className="text-muted-foreground">airing est:</span> {(anime?.status === 'Currently Airing' || anime?.airing) ? estimateAiredCount() : 0}</div>
                  <div><span className="text-muted-foreground">effective:</span> {effectiveTotal}</div>
                  <div><span className="text-muted-foreground">part:</span> {partNumber} (offset {partStart})</div>
                  <div><span className="text-muted-foreground">anilist cache:</span> {anilistMeta?.source ?? 'n/a'}</div>
                </div>
              </div>
            )}

            {/* Page selector for long series */}
            {totalPages > 1 && (
              <div className="flex flex-wrap items-center gap-2 mb-4">
                <span className="text-xs text-muted-foreground font-semibold">Page:</span>
                {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
                  <button
                    key={page}
                    onClick={() => setCurrentPage(page)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                      currentPage === page ? 'bg-primary text-primary-foreground' : 'bg-secondary hover:bg-muted text-muted-foreground'
                    }`}
                  >
                    {(page - 1) * EPISODES_PER_PAGE + 1}-{Math.min(page * EPISODES_PER_PAGE, displayEpisodes.length)}
                  </button>
                ))}
              </div>
            )}

            {episodesLoading && episodes.length === 0 ? (
              <div className="flex items-center justify-center py-8 gap-2">
                <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                <span className="text-sm text-muted-foreground">Loading episodes...</span>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {paginatedEpisodes.length > 0 ? paginatedEpisodes.map((ep: any) => (
                  <button
                    key={ep.mal_id}
                    onClick={() => { setSelectedEpisode(ep.mal_id); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                    className={`flex items-center gap-3 p-3 rounded-lg border transition-all text-left ${
                      selectedEpisode === ep.mal_id ? 'border-primary bg-primary/5' : 'border-border/30 hover:border-primary/30 hover:bg-secondary/30'
                    }`}
                  >
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold shrink-0 ${
                      selectedEpisode === ep.mal_id ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground'
                    }`}>
                      {ep.mal_id}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold truncate">{ep.title || `Episode ${ep.mal_id}`}</p>
                      {ep.aired && <p className="text-[10px] text-muted-foreground">{new Date(ep.aired).toLocaleDateString()}</p>}
                    </div>
                    <Play size={14} className="text-muted-foreground shrink-0" />
                  </button>
                )) : (
                  <p className="text-sm text-muted-foreground col-span-2 text-center py-8">No episode data available. Click "Watch Now" to start from Episode 1.</p>
                )}
              </div>
            )}
          </section>
        </main>
      </div>
    </div>
  );
};

export default AnimeDetails;