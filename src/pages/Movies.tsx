import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Navbar from '@/components/Navbar';
import ContentRow from '@/components/ContentRow';
import AppFooter from '@/components/AppFooter';
import { tmdbService, TMDBMovie } from '@/lib/tmdb';
import { Star, Play } from 'lucide-react';
import { motion } from 'framer-motion';

const Movies = () => {
  const navigate = useNavigate();
  const [popular, setPopular] = useState<TMDBMovie[]>([]);
  const [topRated, setTopRated] = useState<TMDBMovie[]>([]);
  const [upcoming, setUpcoming] = useState<TMDBMovie[]>([]);
  const [nowPlaying, setNowPlaying] = useState<TMDBMovie[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const [p, t, u, n] = await Promise.all([
          tmdbService.getPopularMovies(),
          tmdbService.getTopRatedMovies(),
          tmdbService.getUpcomingMovies(),
          tmdbService.getNowPlayingMovies(),
        ]);
        setPopular(p);
        setTopRated(t);
        setUpcoming(u);
        setNowPlaying(n);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const handleClick = (id: number) => navigate(`/movie/${id}`);

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="pt-24 pb-20 max-w-7xl mx-auto px-4 md:px-6 space-y-10">
        <div>
          <h1 className="text-3xl md:text-4xl font-bold font-display mb-2">Movies</h1>
          <p className="text-sm text-muted-foreground">Discover and stream movies powered by Vidnest servers.</p>
        </div>
        <ContentRow title="🎬 Now Playing" items={nowPlaying} onItemClick={handleClick} loading={loading} />
        <ContentRow title="🔥 Popular" items={popular} onItemClick={handleClick} loading={loading} />
        <ContentRow title="⭐ Top Rated" items={topRated} onItemClick={handleClick} loading={loading} />
        <ContentRow title="🎥 Upcoming" items={upcoming} onItemClick={handleClick} loading={loading} />
      </main>
      <AppFooter />
    </div>
  );
};

export default Movies;
