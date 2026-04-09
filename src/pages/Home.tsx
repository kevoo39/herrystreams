import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Navbar from '@/components/Navbar';
import HeroSection from '@/components/HeroSection';
import ContentRow from '@/components/ContentRow';
import AnimeRow from '@/components/AnimeRow';
import AppFooter from '@/components/AppFooter';
import { tmdbService, TMDBMovie } from '@/lib/tmdb';

const Home = () => {
  const navigate = useNavigate();
  const [trending, setTrending] = useState<TMDBMovie[]>([]);
  const [popular, setPopular] = useState<TMDBMovie[]>([]);
  const [topRated, setTopRated] = useState<TMDBMovie[]>([]);
  const [nowPlaying, setNowPlaying] = useState<TMDBMovie[]>([]);
  const [animeData, setAnimeData] = useState<{ trending: any[]; popular: any[] }>({ trending: [], popular: [] });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const [t, p, tr, np] = await Promise.all([
          tmdbService.getTrendingMovies(),
          tmdbService.getPopularMovies(),
          tmdbService.getTopRatedMovies(),
          tmdbService.getNowPlayingMovies(),
        ]);
        setTrending(t);
        setPopular(p);
        setTopRated(tr);
        setNowPlaying(np);
      } catch (e) {
        console.error('Error loading content:', e);
      } finally {
        setLoading(false);
      }
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
      } catch (e) {
        console.error('Error loading anime:', e);
      }
    };

    load();
    loadAnime();
  }, []);

  const handleMovieClick = (id: number) => navigate(`/movie/${id}`);

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main>
        <HeroSection movie={trending[0]} onPlay={handleMovieClick} onInfo={handleMovieClick} />
        <div className="max-w-7xl mx-auto px-4 md:px-6 -mt-16 relative z-10 pb-20 space-y-10">
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
