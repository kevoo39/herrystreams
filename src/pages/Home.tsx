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
    setResume(getAllResume().slice(0, 10));
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
    else if (e.kind === 'tv') navigate(`/tv/${e.tmdbId}`);
    else navigate(`/anime/${e.malId ?? e.anilistId}`);
  };

  const dismissResume = (id: string) => {
    removeResume(id);
    setResume((prev) => prev.filter((e) => e.id !== id));
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main>
        <HeroSection movie={trending[0]} onPlay={handleMovieClick} onInfo={handleMovieClick} />
        <div className="max-w-7xl mx-auto px-4 md:px-6 -mt-16 relative z-10 pb-20 space-y-10">
          {resume.length > 0 && (
            <section>
              <h2 className="text-xl md:text-2xl font-bold mb-4 text-foreground">▶️ Continue Watching</h2>
              <div className="flex gap-3 overflow-x-auto pb-3 -mx-4 px-4 md:mx-0 md:px-0 scrollbar-hide">
                {resume.map((e) => {
                  const pct = e.duration > 0 ? Math.min(100, (e.position / e.duration) * 100) : 0;
                  const subtitle =
                    e.kind === 'tv' ? `S${e.season}·E${e.episode}` :
                    e.kind === 'anime' ? `Ep ${e.animeEpisode} · ${e.audioType?.toUpperCase()}` :
                    'Movie';
                  return (
                    <div key={e.id} className="relative group min-w-[180px] w-[180px] cursor-pointer" onClick={() => openResume(e)}>
                      <div className="aspect-video bg-secondary rounded-lg overflow-hidden border border-border/30">
                        {e.poster ? (
                          <img src={e.poster} alt={e.title} className="w-full h-full object-cover" loading="lazy" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-muted-foreground text-xs">No preview</div>
                        )}
                        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                          <Play className="w-10 h-10 text-primary" fill="currentColor" />
                        </div>
                        <button
                          onClick={(ev) => { ev.stopPropagation(); dismissResume(e.id); }}
                          aria-label="Remove from continue watching"
                          className="absolute top-1 right-1 bg-black/70 hover:bg-destructive rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <X size={12} className="text-white" />
                        </button>
                        <div className="absolute bottom-0 left-0 right-0 h-1 bg-black/60">
                          <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                      <p className="mt-2 text-xs font-semibold text-foreground line-clamp-1">{e.title}</p>
                      <p className="text-[10px] text-muted-foreground">{subtitle}</p>
                    </div>
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
