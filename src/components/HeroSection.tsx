import { Play, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { tmdbService, TMDBMovie } from "@/lib/tmdb";
import { motion } from "framer-motion";

interface HeroSectionProps {
  movie?: TMDBMovie;
  onPlay?: (id: number) => void;
  onInfo?: (id: number) => void;
}

const HeroSection = ({ movie, onPlay, onInfo }: HeroSectionProps) => {
  if (!movie) {
    return <div className="h-[70vh] bg-secondary animate-pulse" />;
  }

  return (
    <section className="relative h-[75vh] w-full overflow-hidden">
      <div className="absolute inset-0">
        <img
          src={tmdbService.getBackdropUrl(movie.backdrop_path)}
          alt={movie.title}
          className="w-full h-full object-cover object-top scale-105 opacity-40"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-background via-background/80 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/20 to-transparent" />
      </div>

      <div className="relative h-full max-w-7xl mx-auto px-4 md:px-6 flex flex-col justify-end pb-24">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="max-w-xl space-y-5"
        >
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-1 bg-primary text-primary-foreground text-[10px] font-bold rounded uppercase tracking-wider">
              Featured
            </span>
            <span className="text-xs font-medium text-muted-foreground">
              {movie.release_date?.slice(0, 4)}
            </span>
            <span className="text-xs font-medium text-muted-foreground">
              ⭐ {movie.vote_average.toFixed(1)}
            </span>
          </div>

          <h1 className="text-4xl md:text-6xl font-bold font-display leading-[1.1] tracking-tight">
            {movie.title}
          </h1>

          <p className="text-sm text-muted-foreground line-clamp-2 leading-relaxed max-w-lg">
            {movie.overview}
          </p>

          <div className="flex items-center gap-3 pt-2">
            <Button
              onClick={() => onPlay?.(movie.id)}
              className="flex items-center gap-2 bg-primary text-primary-foreground px-6 py-3 rounded-lg font-semibold text-sm hover:brightness-110 transition-all shadow-lg shadow-primary/25"
            >
              <Play size={16} fill="currentColor" />
              Watch Now
            </Button>
            <Button
              variant="outline"
              onClick={() => onInfo?.(movie.id)}
              className="flex items-center gap-2 bg-secondary border border-border/50 px-6 py-3 rounded-lg font-semibold text-sm hover:bg-muted transition-colors"
            >
              <Info size={16} />
              More Info
            </Button>
          </div>
        </motion.div>
      </div>
    </section>
  );
};

export default HeroSection;
