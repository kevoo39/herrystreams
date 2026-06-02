import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Navbar from '@/components/Navbar';
import { tmdbService, TMDBTVShow } from '@/lib/tmdb';
import { Star, Play, ChevronLeft, ChevronRight } from 'lucide-react';
import { motion } from 'framer-motion';
import { useRef } from 'react';

const TVShowRow = ({ title, items, onItemClick, loading }: { title: string; items: TMDBTVShow[]; onItemClick: (id: number) => void; loading: boolean }) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const scroll = (dir: 'left' | 'right') => {
    scrollRef.current?.scrollBy({ left: dir === 'left' ? -400 : 400, behavior: 'smooth' });
  };

  if (loading) {
    return (
      <section className="space-y-4">
        <div className="h-6 w-40 bg-secondary animate-pulse rounded" />
        <div className="flex gap-4 overflow-hidden">
          {[...Array(6)].map((_, i) => <div key={i} className="flex-shrink-0 w-[140px] md:w-[170px] aspect-[2/3] bg-secondary animate-pulse rounded-lg" />)}
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg md:text-xl font-bold font-display tracking-tight">{title}</h2>
        <div className="flex gap-1">
          <button onClick={() => scroll('left')} className="p-1.5 rounded-lg bg-secondary hover:bg-muted transition-colors text-muted-foreground"><ChevronLeft size={16} /></button>
          <button onClick={() => scroll('right')} className="p-1.5 rounded-lg bg-secondary hover:bg-muted transition-colors text-muted-foreground"><ChevronRight size={16} /></button>
        </div>
      </div>
      <div ref={scrollRef} className="flex gap-4 overflow-x-auto scrollbar-hide pb-2">
        {items.map((item) => (
          <motion.div key={item.id} whileHover={{ y: -4 }} className="group flex-shrink-0 w-[140px] md:w-[170px] flex flex-col gap-2 cursor-pointer" onClick={() => onItemClick(item.id)}>
            <div className="relative aspect-[2/3] overflow-hidden rounded-lg bg-secondary">
              <img src={tmdbService.getImageUrl(item.poster_path)} alt={item.name} className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105" loading="lazy" />
              <div className="absolute inset-0 bg-background/0 group-hover:bg-background/40 transition-colors flex items-center justify-center">
                <div className="w-10 h-10 bg-primary rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 scale-75 group-hover:scale-100 transition-all">
                  <Play className="text-primary-foreground fill-current ml-0.5" size={18} />
                </div>
              </div>
              {item.vote_average > 0 && (
                <div className="absolute top-2 right-2 bg-background/80 backdrop-blur-sm px-1.5 py-0.5 rounded flex items-center gap-1">
                  <Star size={10} className="text-primary fill-current" />
                  <span className="text-[10px] font-bold">{item.vote_average.toFixed(1)}</span>
                </div>
              )}
            </div>
            <h3 className="text-xs font-semibold line-clamp-1 group-hover:text-primary transition-colors">{item.name}</h3>
            <span className="text-[10px] text-muted-foreground">{item.first_air_date?.slice(0, 4)}</span>
          </motion.div>
        ))}
      </div>
    </section>
  );
};

const TVShows = () => {
  const navigate = useNavigate();
  const [trending, setTrending] = useState<TMDBTVShow[]>([]);
  const [popular, setPopular] = useState<TMDBTVShow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const [t, p] = await Promise.all([
          tmdbService.getTrendingTVShows(),
          tmdbService.getPopularTVShows(),
        ]);
        setTrending(t);
        setPopular(p);
      } catch (e) { console.error(e); }
      finally { setLoading(false); }
    };
    load();
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="pt-24 pb-20 max-w-7xl mx-auto px-4 md:px-6 space-y-10">
        <div>
          <h1 className="text-3xl md:text-4xl font-bold font-display mb-2">TV Shows</h1>
          <p className="text-sm text-muted-foreground">Stream TV series with KevNest servers.</p>
        </div>
        <TVShowRow title="🔥 Trending" items={trending} onItemClick={(id) => navigate(`/tv/${id}`)} loading={loading} />
        <TVShowRow title="⭐ Popular" items={popular} onItemClick={(id) => navigate(`/tv/${id}`)} loading={loading} />
      </main>
    </div>
  );
};

export default TVShows;
