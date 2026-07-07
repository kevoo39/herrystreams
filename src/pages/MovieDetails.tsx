import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Navbar from '@/components/Navbar';
import VideoPlayer from '@/components/VideoPlayer';
import { tmdbService, TMDBMovieDetails, TMDBMovie } from '@/lib/tmdb';
import ContentRow from '@/components/ContentRow';
import { Play, Plus, Star, Calendar, Clock, ChevronLeft, Check } from 'lucide-react';
import { motion } from 'framer-motion';
import { addToMyList, removeFromMyList, isInMyList } from '@/lib/myList';
import EpisodeDownloadButton from '@/components/EpisodeDownloadButton';

const MovieDetails = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [movie, setMovie] = useState<TMDBMovieDetails | null>(null);
  const [similar, setSimilar] = useState<TMDBMovie[]>([]);
  const [loading, setLoading] = useState(true);
  const [showPlayer, setShowPlayer] = useState(false);
  const [inList, setInList] = useState(false);

  useEffect(() => {
    if (!id) return;
    const load = async () => {
      try {
        setLoading(true);
        const [m, s] = await Promise.all([
          tmdbService.getMovieDetails(parseInt(id)),
          tmdbService.getSimilarMovies(id),
        ]);
        setMovie(m);
        setSimilar(s.slice(0, 20));
        setInList(isInMyList(`movie-${id}`));
      } catch (e) { console.error(e); }
      finally { setLoading(false); }
    };
    load();
    window.scrollTo(0, 0);
  }, [id]);

  const toggleList = () => {
    if (!movie || !id) return;
    if (inList) {
      removeFromMyList(`movie-${id}`);
      setInList(false);
    } else {
      addToMyList({
        id: `movie-${id}`,
        title: movie.title,
        image: tmdbService.getImageUrl(movie.poster_path),
        type: 'movie',
        addedAt: new Date().toISOString(),
      });
      setInList(true);
    }
  };

  if (loading) return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="w-10 h-10 border-2 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  );

  if (!movie) return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <span className="text-muted-foreground">Movie not found</span>
    </div>
  );

  if (showPlayer) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <main className="pt-20 pb-20 max-w-7xl mx-auto px-4 md:px-6">
          <div className="flex items-center gap-3 mb-4">
            <button onClick={() => setShowPlayer(false)} className="p-1.5 hover:bg-secondary rounded-lg transition-colors">
              <ChevronLeft size={18} />
            </button>
            <h2 className="text-lg font-bold font-display truncate">{movie.title}</h2>
          </div>
          <VideoPlayer tmdbId={movie.id} title={movie.title} type="movie" />
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="relative pt-16">
        <div className="absolute inset-0 h-[400px] overflow-hidden pointer-events-none">
          <img src={tmdbService.getBackdropUrl(movie.backdrop_path)} alt="" className="w-full h-full object-cover blur-[80px] opacity-15 scale-150" />
          <div className="absolute inset-0 bg-gradient-to-b from-transparent to-background" />
        </div>

        <main className="relative max-w-7xl mx-auto px-4 md:px-6 py-8">
          <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-8 mb-12">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="hidden lg:block">
              <div className="aspect-[2/3] rounded-xl overflow-hidden border border-border/30 shadow-xl">
                <img src={tmdbService.getPosterUrl(movie.poster_path)} alt={movie.title} className="w-full h-full object-cover" />
              </div>
            </motion.div>

            <div className="space-y-5 min-w-0">
              <div className="flex flex-wrap gap-2">
                {movie.genres?.map(g => (
                  <span key={g.id} className="px-2 py-0.5 bg-primary/10 text-primary rounded text-[10px] font-bold border border-primary/20">{g.name}</span>
                ))}
              </div>
              <h1 className="text-2xl md:text-4xl font-bold font-display tracking-tight leading-tight">{movie.title}</h1>
              <div className="flex flex-wrap items-center gap-4 text-xs font-medium text-muted-foreground">
                {movie.vote_average > 0 && <div className="flex items-center gap-1 text-primary"><Star size={14} fill="currentColor" /><span className="font-bold">{movie.vote_average.toFixed(1)}</span></div>}
                <div className="flex items-center gap-1"><Calendar size={12} /><span>{movie.release_date?.slice(0, 4)}</span></div>
                {movie.runtime > 0 && <div className="flex items-center gap-1"><Clock size={12} /><span>{movie.runtime} min</span></div>}
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">{movie.overview}</p>
              <div className="flex flex-wrap gap-3">
                <button onClick={() => setShowPlayer(true)} className="flex items-center gap-2 bg-primary text-primary-foreground px-6 py-3 rounded-lg font-semibold text-sm hover:brightness-110 transition-all shadow-lg shadow-primary/20">
                  <Play size={16} fill="currentColor" />Watch Now
                </button>
                <button onClick={toggleList} className="flex items-center gap-2 bg-secondary border border-border/30 px-6 py-3 rounded-lg font-semibold text-sm hover:bg-muted transition-colors">
                  {inList ? <Check size={16} className="text-primary" /> : <Plus size={16} />}
                  {inList ? 'In List' : 'My List'}
                </button>
                <EpisodeDownloadButton
                  variant="full"
                  target={{
                    kind: 'movie',
                    tmdbId: movie.id,
                    parentTitle: movie.title,
                    image: tmdbService.getPosterUrl(movie.poster_path),
                  }}
                />
              </div>

              {movie.credits?.cast && movie.credits.cast.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold mb-2">Cast</h3>
                  <div className="flex flex-wrap gap-2">
                    {movie.credits.cast.slice(0, 8).map(c => (
                      <span key={c.id} className="text-xs text-muted-foreground bg-secondary px-2 py-1 rounded">{c.name}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {similar.length > 0 && (
            <ContentRow title="Similar Movies" items={similar} onItemClick={(id) => navigate(`/movie/${id}`)} />
          )}
        </main>
      </div>
    </div>
  );
};

export default MovieDetails;
