import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Play, X } from 'lucide-react';
import Navbar from '@/components/Navbar';
import HeroSection from '@/components/HeroSection';
import ContentRow from '@/components/ContentRow';
import AnimeRow from '@/components/AnimeRow';
import AppFooter from '@/components/AppFooter';
import { tmdbService, TMDBMovie } from '@/lib/tmdb';
import { getAllResume, removeResume, type ResumeEntry } from '@/lib/resume';

const Home = () => {
  const navigate = useNavigate();
  const [trending, setTrending] = useState<TMDBMovie[]>([]);
  const [popular, setPopular] = useState<TMDBMovie[]>([]);
  const [topRated, setTopRated] = useState<TMDBMovie[]>([]);
  const [nowPlaying, setNowPlaying] = useState<TMDBMovie[]>([]);
  const [animeData, setAnimeData] = useState<{ trending: any[]; popular: any[] }>({ trending: [], popular: [] });
  const [loading, setLoading] = useState(true);
  const [resume, setResume] = useState<ResumeEntry[]>([]);

  useEffect(() => {
    // Dedupe TV/anime by series — keep only the most recent episode per show
    const all = getAllResume();
    const seen = new Set<string>();
    const deduped: ResumeEntry[] = [];
    for (const e of all) {
      const key =
        e.kind === 'tv' ? `tv:${e.tmdbId}` :
        e.kind === 'anime' ? `anime:${e.malId ?? e.anilistId}` :
        `movie:${e.tmdbId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      deduped.push(e);
    }
    setResume(deduped.slice(0, 10));
    const load = async () => {
      try {
        const [t, p, tr, np] = await Promise.all([
          tmdbService.getTrendingMovies(),
          tmdbService.getPopularMovies(),
          tmdbService.getTopRatedMovies(),
          tmdbService.getNowPlayingMovies(),
        ]);
        setTrending(t); setPopular(p); setTopRated(tr); setNowPlaying(np);
      } catch (e) { console.error('Error loading content:', e); }
      finally { setLoading(false); }
    };

    const loadAnime = async () => {
      try {
        const [tRes, pRes] = await Promise.all([
          fetch('https://api.jikan.moe/v4/top/anime?filter=airing&limit=15'),
          fetch('https://api.jikan.moe/v4/top/anime?filter=bypopularity&limit=15'),
        ]);
        const tData = await tRes.json();
        const pData = await pRes.json();
        setAnimeData({ trending: tData.data || [], popular: pData.data || [] });
      } catch (e) { console.error('Error loading anime:', e); }
    };

    load();
    loadAnime();
  }, []);

  const handleMovieClick = (id: number) => navigate(`/movie/${id}`);

  const openResume = (e: ResumeEntry) => {
    if (e.kind === 'movie') navigate(`/movie/${e.tmdbId}`);
    else if (e.kind === 'tv') navigate(`/tv/${e.tmdbId}?s=${e.season}&e=${e.episode}`);
    else navigate(`/anime/${e.malId ?? e.anilistId}?ep=${e.animeEpisode}&audio=${e.audioType ?? 'sub'}`);
  };

  const dismissResume = (entry: ResumeEntry) => {
    // Remove all entries of this series (every season/episode), not just one
    const all = getAllResume();
    for (const e of all) {
      const same =
        entry.kind === 'tv' ? e.kind === 'tv' && e.tmdbId === entry.tmdbId :
        entry.kind === 'anime' ? e.kind === 'anime' && (e.malId ?? e.anilistId) === (entry.malId ?? entry.anilistId) :
        e.kind === 'movie' && e.tmdbId === entry.tmdbId;
      if (same) removeResume(e.id);
    }
    setResume((prev) => prev.filter((e) => e.id !== entry.id));
  };

  const fmtRemaining = (pos: number, dur: number) => {
    const left = Math.max(0, dur - pos);
    if (!Number.isFinite(left) || left <= 0) return '';
    const m = Math.floor(left / 60);
    if (m < 1) return '<1 min left';
    if (m < 60) return `${m} min left`;
    const h = Math.floor(m / 60);
    return `${h}h ${m % 60}m left`;
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main>
        <HeroSection movie={trending[0]} onPlay={handleMovieClick} onInfo={handleMovieClick} />
        <div className="max-w-7xl mx-auto px-4 md:px-6 -mt-16 relative z-10 pb-20 space-y-10">
          {resume.length > 0 && (
            <section aria-label="Continue Watching">
              <div className="flex items-baseline justify-between mb-4">
                <h2 className="text-xl md:text-2xl font-bold text-foreground">▶️ Continue Watching</h2>
                <span className="text-xs text-muted-foreground">{resume.length} item{resume.length === 1 ? '' : 's'}</span>
              </div>
              <div className="flex gap-3 md:gap-4 overflow-x-auto pb-3 -mx-4 px-4 md:mx-0 md:px-0 scrollbar-hide snap-x snap-mandatory">
                {resume.map((e) => {
                  const pct = e.duration > 0 ? Math.min(100, (e.position / e.duration) * 100) : 0;
                  const subtitle =
                    e.kind === 'tv' ? `S${e.season} · E${e.episode}` :
                    e.kind === 'anime' ? `Ep ${e.animeEpisode} · ${(e.audioType ?? 'sub').toUpperCase()}` :
                    'Movie';
                  const remaining = fmtRemaining(e.position, e.duration);
                  return (
                    <article
                      key={e.id}
                      className="relative group min-w-[140px] w-[140px] md:min-w-[170px] md:w-[170px] cursor-pointer snap-start focus-within:ring-2 focus-within:ring-primary rounded-lg"
                      onClick={() => openResume(e)}
                    >
                      <div className="relative aspect-[2/3] bg-secondary rounded-lg overflow-hidden border border-border/30 shadow-lg shadow-black/30">
                        {e.poster ? (
                          <img
                            src={e.poster}
                            alt={e.title}
                            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                            loading="lazy"
                            onError={(ev) => { (ev.currentTarget as HTMLImageElement).style.display = 'none'; }}
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-muted-foreground text-[10px] px-2 text-center">
                            {e.title}
                          </div>
                        )}
                        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/10 to-transparent" />
                        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                          <div className="bg-primary/95 rounded-full p-3 shadow-xl shadow-primary/40">
                            <Play className="w-6 h-6 text-primary-foreground" fill="currentColor" />
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={(ev) => { ev.stopPropagation(); dismissResume(e); }}
                          aria-label={`Remove ${e.title} from continue watching`}
                          className="absolute top-1.5 right-1.5 bg-black/75 hover:bg-destructive active:bg-destructive rounded-full p-1.5 transition-colors md:opacity-0 md:group-hover:opacity-100 md:focus:opacity-100"
                        >
                          <X size={14} className="text-white" />
                        </button>
                        {remaining && (
                          <span className="absolute bottom-3 right-2 bg-black/75 text-white text-[10px] font-semibold px-1.5 py-0.5 rounded">
                            {remaining}
                          </span>
                        )}
                        <div className="absolute bottom-0 left-0 right-0 h-1.5 bg-black/60">
                          <div className="h-full bg-primary transition-all" style={{ width: `${pct}%` }} aria-label={`${Math.round(pct)}% watched`} />
                        </div>
                      </div>
                      <p className="mt-2 text-sm font-semibold text-foreground line-clamp-1">{e.title}</p>
                      <p className="text-[11px] text-muted-foreground">{subtitle}</p>
                    </article>
                  );
                })}
              </div>
            </section>
          )}
          <ContentRow title="🔥 Trending Movies" items={trending} onItemClick={handleMovieClick} loading={loading} />
          <ContentRow title="🎬 Now Playing" items={nowPlaying} onItemClick={handleMovieClick} loading={loading} />
          <ContentRow title="⭐ Top Rated" items={topRated} onItemClick={handleMovieClick} loading={loading} />
          <ContentRow title="🎥 Popular" items={popular} onItemClick={handleMovieClick} loading={loading} />
          <AnimeRow title="🔥 Trending Anime" animeList={animeData.trending} loading={!animeData.trending.length && loading} />
          <AnimeRow title="⭐ Popular Anime" animeList={animeData.popular} loading={!animeData.popular.length && loading} />
        </div>
      </main>
      <AppFooter />
    </div>
  );
};

export default Home;
