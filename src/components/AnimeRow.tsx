import { useRef } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Star, Play } from 'lucide-react';
import { motion } from 'framer-motion';

interface AnimeRowProps {
  title: string;
  animeList: any[];
  loading?: boolean;
}

const AnimeRow = ({ title, animeList, loading }: AnimeRowProps) => {
  const scrollRef = useRef<HTMLDivElement>(null);

  const scroll = (dir: 'left' | 'right') => {
    if (scrollRef.current) {
      scrollRef.current.scrollBy({ left: dir === 'left' ? -400 : 400, behavior: 'smooth' });
    }
  };

  if (loading) {
    return (
      <section className="space-y-4">
        <div className="h-6 w-40 bg-secondary animate-pulse rounded" />
        <div className="flex gap-4 overflow-hidden">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="flex-shrink-0 w-[140px] md:w-[170px] aspect-[2/3] bg-secondary animate-pulse rounded-lg" />
          ))}
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg md:text-xl font-bold font-display tracking-tight">{title}</h2>
        <div className="flex items-center gap-1">
          <button onClick={() => scroll('left')} className="p-1.5 rounded-lg bg-secondary hover:bg-muted transition-colors text-muted-foreground hover:text-foreground">
            <ChevronLeft size={16} />
          </button>
          <button onClick={() => scroll('right')} className="p-1.5 rounded-lg bg-secondary hover:bg-muted transition-colors text-muted-foreground hover:text-foreground">
            <ChevronRight size={16} />
          </button>
        </div>
      </div>
      <div ref={scrollRef} className="flex gap-4 overflow-x-auto scrollbar-hide pb-2">
        {animeList.map((anime) => (
          <motion.div
            key={anime.mal_id}
            whileHover={{ y: -4 }}
            transition={{ duration: 0.2 }}
            className="group flex-shrink-0 w-[140px] md:w-[170px] flex flex-col gap-2"
          >
            <Link to={`/anime/${anime.mal_id}`} className="relative aspect-[2/3] overflow-hidden rounded-lg bg-secondary">
              <img
                src={anime.images?.webp?.large_image_url || anime.images?.jpg?.large_image_url}
                alt={anime.title}
                className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                loading="lazy"
              />
              <div className="absolute inset-0 bg-background/0 group-hover:bg-background/40 transition-colors duration-200 flex items-center justify-center">
                <div className="w-10 h-10 bg-primary rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 scale-75 group-hover:scale-100 transition-all duration-200">
                  <Play className="text-primary-foreground fill-current ml-0.5" size={18} />
                </div>
              </div>
              {anime.score && anime.score > 0 && (
                <div className="absolute top-2 right-2 bg-background/80 backdrop-blur-sm px-1.5 py-0.5 rounded flex items-center gap-1">
                  <Star size={10} className="text-primary fill-current" />
                  <span className="text-[10px] font-bold text-foreground">{anime.score}</span>
                </div>
              )}
            </Link>
            <div className="flex flex-col gap-0.5 w-full min-w-0">
              <h3 className="text-xs font-semibold line-clamp-1 group-hover:text-primary transition-colors">{anime.title}</h3>
              <div className="flex items-center gap-1 min-w-0">
                {anime.type && <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider shrink-0">{anime.type}</span>}
                {anime.episodes && <span className="text-[10px] text-muted-foreground">• {anime.episodes} ep</span>}
              </div>
            </div>
          </motion.div>
        ))}
      </div>
    </section>
  );
};

export default AnimeRow;
