import { useEffect, useState } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import Navbar from '@/components/Navbar';
import AppFooter from '@/components/AppFooter';
import { tmdbService, TMDBMovie, TMDBTVShow } from '@/lib/tmdb';
import { Search as SearchIcon, Star, Play } from 'lucide-react';
import { motion } from 'framer-motion';

const SearchPage = () => {
  const [searchParams] = useSearchParams();
  const query = searchParams.get('q') || '';
  const navigate = useNavigate();
  const [movies, setMovies] = useState<TMDBMovie[]>([]);
  const [shows, setShows] = useState<TMDBTVShow[]>([]);
  const [animeResults, setAnimeResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!query) return;
    const search = async () => {
      setLoading(true);
      try {
        const [m, s] = await Promise.all([
          tmdbService.searchMovies(query),
          tmdbService.searchTVShows(query),
        ]);
        setMovies(m);
        setShows(s);

        const animeRes = await fetch(`https://api.jikan.moe/v4/anime?q=${encodeURIComponent(query)}&limit=12`);
        const animeData = await animeRes.json();
        setAnimeResults(animeData.data || []);
      } catch (e) { console.error(e); }
      finally { setLoading(false); }
    };
    search();
  }, [query]);

  const renderCard = (item: { id: number | string; title: string; image: string; year?: string; rating?: number; type: string; linkTo: string }) => (
    <motion.div
      key={`${item.type}-${item.id}`}
      whileHover={{ y: -4 }}
      className="group cursor-pointer"
      onClick={() => navigate(item.linkTo)}
    >
      <div className="relative aspect-[2/3] overflow-hidden rounded-lg bg-secondary">
        <img src={item.image} alt={item.title} className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105" loading="lazy" />
        <div className="absolute inset-0 bg-background/0 group-hover:bg-background/40 transition-colors flex items-center justify-center">
          <div className="w-10 h-10 bg-primary rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 scale-75 group-hover:scale-100 transition-all">
            <Play className="text-primary-foreground fill-current ml-0.5" size={18} />
          </div>
        </div>
        {item.rating && item.rating > 0 && (
          <div className="absolute top-2 right-2 bg-background/80 backdrop-blur-sm px-1.5 py-0.5 rounded flex items-center gap-1">
            <Star size={10} className="text-primary fill-current" />
            <span className="text-[10px] font-bold">{item.rating.toFixed(1)}</span>
          </div>
        )}
        <div className="absolute bottom-2 left-2">
          <span className="px-1.5 py-0.5 bg-primary/80 text-primary-foreground text-[9px] font-bold rounded uppercase">{item.type}</span>
        </div>
      </div>
      <h3 className="text-xs font-semibold line-clamp-1 mt-2 group-hover:text-primary transition-colors">{item.title}</h3>
      {item.year && <span className="text-[10px] text-muted-foreground">{item.year}</span>}
    </motion.div>
  );

  const allResults = [
    ...movies.map(m => ({ id: m.id, title: m.title, image: tmdbService.getImageUrl(m.poster_path), year: m.release_date?.slice(0, 4), rating: m.vote_average, type: 'Movie', linkTo: `/movie/${m.id}` })),
    ...shows.map(s => ({ id: s.id, title: s.name, image: tmdbService.getImageUrl(s.poster_path), year: s.first_air_date?.slice(0, 4), rating: s.vote_average, type: 'TV', linkTo: `/tv/${s.id}` })),
    ...animeResults.map((a: any) => ({ id: a.mal_id, title: a.title, image: a.images?.webp?.large_image_url || '', year: a.aired?.prop?.from?.year?.toString(), rating: a.score, type: 'Anime', linkTo: `/anime/${a.mal_id}` })),
  ];

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="pt-24 pb-20 max-w-7xl mx-auto px-4 md:px-6">
        <div className="mb-8">
          <h1 className="text-2xl md:text-3xl font-bold font-display">
            {query ? `Results for "${query}"` : 'Search'}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">{allResults.length} results found across movies, TV shows, and anime.</p>
        </div>

        {loading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
            {[...Array(12)].map((_, i) => <div key={i} className="aspect-[2/3] bg-secondary animate-pulse rounded-lg" />)}
          </div>
        ) : allResults.length > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
            {allResults.map(renderCard)}
          </div>
        ) : query ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-16 h-16 bg-secondary rounded-full flex items-center justify-center mb-4">
              <SearchIcon size={28} className="text-muted-foreground" />
            </div>
            <h2 className="text-xl font-bold font-display mb-2">No results found</h2>
            <p className="text-sm text-muted-foreground">Try different keywords.</p>
          </div>
        ) : null}
      </main>
      <AppFooter />
    </div>
  );
};

export default SearchPage;
